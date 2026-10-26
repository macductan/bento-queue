package engine

import (
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/dop251/goja"

	"hecto-api/model"
	"hecto-api/service"
	"hecto-api/storage"
)

// FlowStepRunOutput represents the execution result of a single FlowStep.
type FlowStepRunOutput struct {
	StepID          string     `json:"step_id"`
	NodeID          string     `json:"node_id"`
	RequestID       string     `json:"request_id"`
	RequestName     string     `json:"request_name,omitempty"`
	Method          string     `json:"method,omitempty"`
	Status          string     `json:"status"` // "passed" | "failed" | "skipped"
	FailureCategory string     `json:"failure_category,omitempty"`
	FailureReason   string     `json:"failure_reason,omitempty"`
	RunOutput       *RunOutput `json:"run_output,omitempty"`
}

// FlowNodeRunOutput represents the execution result of a single FlowNode (sequential step or parallel row).
type FlowNodeRunOutput struct {
	NodeID          string              `json:"node_id"`
	Status          string              `json:"status"` // "passed" | "failed" | "skipped"
	MatchedBranchID string              `json:"matched_branch_id,omitempty"`
	StepResults     []FlowStepRunOutput `json:"step_results"`
}

// FlowRunOutput is the canonical output returned by ExecuteFlow and `hecto flow run`.
type FlowRunOutput struct {
	FlowID        string              `json:"flow_id"`
	FlowName      string              `json:"flow_name"`
	Status        string              `json:"status"` // "passed" | "failed"
	TotalTimeMs   int64               `json:"total_time_ms"`
	StepsExecuted int                 `json:"steps_executed"`
	StepsPassed   int                 `json:"steps_passed"`
	StepsFailed   int                 `json:"steps_failed"`
	StepsSkipped  int                 `json:"steps_skipped"`
	HaltedError   string              `json:"halted_error,omitempty"`
	NodeResults   []FlowNodeRunOutput `json:"node_results"`
	StepResults   []FlowStepRunOutput `json:"step_results"`
}

// FlowRunOptions configures an ExecuteFlow invocation.
type FlowRunOptions struct {
	FS              *storage.FileSystem
	CollectionSvc   *service.CollectionService
	EnvSvc          *service.EnvironmentService
	RequestSvc      *service.RequestService
	FlowSvc         *service.FlowService
	ExecutorSvc     *service.ExecutorService
	HistorySvc      *service.HistoryService
	CollectionsRoot string
	CollectionRoot  string
	Collection      model.Collection
	Flow            model.Flow
	Environments    []model.Environment
	ActiveEnvID     string
	CLIVarOverrides map[string]string
	TimeoutMs       int
	NoSaveEnv       bool
}

type stepVerdictJSInput struct {
	RequestMissing bool               `json:"requestMissing,omitempty"`
	NetworkError   string             `json:"networkError,omitempty"`
	ScriptError    string             `json:"scriptError,omitempty"`
	ScriptTests    []ScriptTestResult `json:"scriptTests,omitempty"`
	StatusCode     int                `json:"statusCode"`
}

type stepVerdictJSResult struct {
	Passed          bool   `json:"passed"`
	FailureReason   string `json:"failureReason,omitempty"`
	FailureCategory string `json:"failureCategory,omitempty"`
}

type branchEvalJSContext struct {
	StatusCode     int               `json:"statusCode"`
	ResponseBody   string            `json:"responseBody"`
	Variables      map[string]string `json:"variables"`
	RequestMissing bool              `json:"requestMissing,omitempty"`
	NetworkError   string            `json:"networkError,omitempty"`
}

type branchSelectionJSResult struct {
	MatchedBranchID  *string  `json:"matchedBranchId"`
	SkippedBranchIDs []string `json:"skippedBranchIds"`
}

type headlessMutableJSState struct {
	Collection           model.Collection    `json:"collection"`
	Environments         []model.Environment `json:"environments"`
	ActiveEnvID          *string             `json:"activeEnvId"`
	AllFolders           []model.TreeNode    `json:"allFolders"`
	CLIVarOverrides      map[string]string   `json:"cliVarOverrides,omitempty"`
	OrderedStepFolderIDs []string            `json:"orderedStepFolderIds,omitempty"`
}

type parallelStepMutationJSItem struct {
	StepID            string             `json:"stepId,omitempty"`
	RequestID         string             `json:"requestId,omitempty"`
	PathFolders       []model.TreeNode   `json:"pathFolders,omitempty"`
	EnvUpdates        map[string]string  `json:"envUpdates,omitempty"`
	ScopedEnvUpdates  *ScopedEnvUpdates  `json:"scopedEnvUpdates,omitempty"`
	ScopedAuthUpdates *ScopedAuthUpdates `json:"scopedAuthUpdates,omitempty"`
}

type mergedParallelJSState struct {
	Collection         model.Collection      `json:"collection"`
	Environments       []model.Environment   `json:"environments"`
	ActiveEnvID        *string               `json:"activeEnvId"`
	AllFolders         []model.TreeNode      `json:"allFolders"`
	ResolvedVariables  map[string]string     `json:"resolvedVariables"`
	MergedScriptResult ScriptExecutionResult `json:"mergedScriptResult"`
}

type preloadedRequestEntry struct {
	request     model.Request
	pathFolders []model.TreeNode
}

func deepCopyViaJSON[T any](val T) T {
	raw, err := json.Marshal(val)
	if err != nil {
		return val
	}
	var out T
	if err := json.Unmarshal(raw, &out); err != nil {
		return val
	}
	return out
}

func cloneStringMap(in map[string]string) map[string]string {
	if in == nil {
		return nil
	}
	out := make(map[string]string, len(in))
	for k, v := range in {
		out[k] = v
	}
	return out
}

func pruneMutatedCLIVarOverrides(overrides map[string]string, res *ScriptExecutionResult) {
	if len(overrides) == 0 || res == nil {
		return
	}
	for k := range res.EnvUpdates {
		delete(overrides, strings.TrimSpace(k))
	}
	for k := range res.ScopedEnvUpdates.Collection {
		delete(overrides, strings.TrimSpace(k))
	}
	for _, kvMap := range res.ScopedEnvUpdates.GlobalEnvs {
		for k := range kvMap {
			delete(overrides, strings.TrimSpace(k))
		}
	}
	for _, kvMap := range res.ScopedEnvUpdates.FolderGlobals {
		for k := range kvMap {
			delete(overrides, strings.TrimSpace(k))
		}
	}
	for _, item := range res.ScopedEnvUpdates.FolderEnvs {
		delete(overrides, strings.TrimSpace(item.Key))
	}
}

func appendOrderedFolderID(order []string, folderID string) []string {
	trimmed := strings.TrimSpace(folderID)
	if trimmed == "" {
		return order
	}
	filtered := make([]string, 0, len(order)+1)
	for _, id := range order {
		if id != trimmed {
			filtered = append(filtered, id)
		}
	}
	return append(filtered, trimmed)
}

func hasScriptExecutionUpdates(res *ScriptExecutionResult) bool {
	if res == nil {
		return false
	}
	if len(res.EnvUpdates) > 0 {
		return true
	}
	if hasScopedEnvUpdates(&res.ScopedEnvUpdates) {
		return true
	}
	if hasScopedAuthUpdates(&res.ScopedAuthUpdates) {
		return true
	}
	return false
}

func callEvaluateStepVerdict(vm *goja.Runtime, input stepVerdictJSInput) (stepVerdictJSResult, error) {
	var out stepVerdictJSResult
	if err := callEngineJSON(vm, "evaluateStepVerdict", input, &out); err != nil {
		return stepVerdictJSResult{}, err
	}
	return out, nil
}

func callEvaluateCustomBranchCondition(
	vm *goja.Runtime,
	condition model.FlowBranchCondition,
	ctx branchEvalJSContext,
) (bool, error) {
	payload := map[string]interface{}{
		"condition": condition,
		"ctx":       ctx,
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		return false, err
	}
	if err := vm.Set("__customBranchEvalInput", string(raw)); err != nil {
		return false, err
	}
	val, err := vm.RunString(`
		(function() {
			var inp = JSON.parse(__customBranchEvalInput);
			return Boolean(globalThis.HectoEngine.evaluateCustomBranchCondition(inp.condition, inp.ctx));
		})()
	`)
	if err != nil {
		return false, err
	}
	return val.ToBoolean(), nil
}

func callSelectMatchingBranch(
	vm *goja.Runtime,
	branches []model.FlowBranch,
	nodePassed bool,
	ctx branchEvalJSContext,
) (branchSelectionJSResult, error) {
	payload := map[string]interface{}{
		"branches":   branches,
		"nodePassed": nodePassed,
		"ctx":        ctx,
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		return branchSelectionJSResult{}, err
	}
	if err := vm.Set("__branchSelectInput", string(raw)); err != nil {
		return branchSelectionJSResult{}, err
	}
	val, err := vm.RunString(`
		(function() {
			var inp = JSON.parse(__branchSelectInput);
			return JSON.stringify(globalThis.HectoEngine.selectMatchingBranch(inp.branches, inp.nodePassed, inp.ctx));
		})()
	`)
	if err != nil {
		return branchSelectionJSResult{}, err
	}
	var out branchSelectionJSResult
	if err := json.Unmarshal([]byte(val.String()), &out); err != nil {
		return branchSelectionJSResult{}, err
	}
	return out, nil
}

func callMergeParallelScriptUpdates(
	vm *goja.Runtime,
	baseState headlessMutableJSState,
	stepOutputs []parallelStepMutationJSItem,
) (mergedParallelJSState, error) {
	payload := map[string]interface{}{
		"baseState":   baseState,
		"stepOutputs": stepOutputs,
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		return mergedParallelJSState{}, err
	}
	if err := vm.Set("__mergeParallelInput", string(raw)); err != nil {
		return mergedParallelJSState{}, err
	}
	val, err := vm.RunString(`
		(function() {
			var inp = JSON.parse(__mergeParallelInput);
			return JSON.stringify(globalThis.HectoEngine.mergeParallelScriptUpdates(inp.baseState, inp.stepOutputs, inp.baseState.orderedStepFolderIds));
		})()
	`)
	if err != nil {
		return mergedParallelJSState{}, err
	}
	var out mergedParallelJSState
	if err := json.Unmarshal([]byte(val.String()), &out); err != nil {
		return mergedParallelJSState{}, err
	}
	return out, nil
}

func collectPreloadedRequestsAndFolders(
	fs *storage.FileSystem,
	nodes []model.TreeNode,
	ancestors []model.TreeNode,
	reqMap map[string]preloadedRequestEntry,
	allFolders *[]model.TreeNode,
) {
	for _, node := range nodes {
		if node.Type == "folder" {
			*allFolders = append(*allFolders, node)
			nextAncestors := append(append([]model.TreeNode{}, ancestors...), node)
			if len(node.Children) > 0 {
				collectPreloadedRequestsAndFolders(fs, node.Children, nextAncestors, reqMap, allFolders)
			}
		} else if node.Type == "request" && node.ID != "" && node.Path != "" {
			var req model.Request
			if err := fs.ReadJSON(node.Path, &req); err == nil {
				if req.Auth == nil {
					req.Auth = &model.AuthConfig{Type: "inherit"}
				}
				if req.Headers == nil {
					req.Headers = []model.KVPair{}
				}
				if req.Params == nil {
					req.Params = []model.KVPair{}
				}
				reqMap[node.ID] = preloadedRequestEntry{
					request:     req,
					pathFolders: append([]model.TreeNode{}, ancestors...),
				}
			}
		}
	}
}

func syncPathFoldersFromAllFolders(pathFolders []model.TreeNode, allFolders []model.TreeNode) []model.TreeNode {
	if len(pathFolders) == 0 {
		return []model.TreeNode{}
	}
	out := make([]model.TreeNode, len(pathFolders))
	for i, pf := range pathFolders {
		matched := false
		for _, af := range allFolders {
			if af.ID == pf.ID {
				out[i] = deepCopyViaJSON(af)
				matched = true
				break
			}
		}
		if !matched {
			out[i] = deepCopyViaJSON(pf)
		}
	}
	return out
}

// ExecuteFlow executes a complete model.Flow flowchart (sequential nodes, parallel rows,
// 3-mode conditional branches, per-step and flow-level timeouts, and max_steps guard)
// using the shared headless-engine.js on goja and ExecutorService.
func ExecuteFlow(opts FlowRunOptions) (*FlowRunOutput, error) {
	startTime := time.Now()
	silentLogger := slog.New(slog.NewTextHandler(io.Discard, nil))

	fs := opts.FS
	if fs == nil {
		fs = storage.NewFileSystem()
	}
	if opts.CollectionRoot != "" {
		fs.SetCollectionRoot(opts.CollectionRoot)
	}
	if opts.CollectionsRoot == "" && opts.CollectionRoot != "" {
		opts.CollectionsRoot = filepath.Dir(opts.CollectionRoot)
	}

	collSvc := opts.CollectionSvc
	if collSvc == nil {
		collSvc = service.NewCollectionService(fs, silentLogger)
	}
	envSvc := opts.EnvSvc
	if envSvc == nil {
		envSvc = service.NewEnvironmentService(fs, silentLogger)
	}
	reqSvc := opts.RequestSvc
	if reqSvc == nil {
		reqSvc = service.NewRequestService(fs, silentLogger)
	}
	execSvc := opts.ExecutorSvc
	if execSvc == nil {
		execSvc = service.NewExecutorService(silentLogger)
	}
	historySvc := opts.HistorySvc
	if historySvc == nil {
		historySvc = service.NewHistoryService(fs, silentLogger)
	}

	// Load Collection if needed
	coll := opts.Collection
	if opts.CollectionRoot != "" && (coll.ID == "" || (coll.Name == "" && len(coll.Variables) == 0 && coll.Auth == nil)) {
		collPath := filepath.Join(opts.CollectionRoot, "collection.json")
		if fs.Exists(collPath) {
			_ = fs.ReadJSON(collPath, &coll)
		}
		if coll.ID == "" {
			coll.ID = filepath.Base(opts.CollectionRoot)
		}
	}

	// Load Environments if needed
	envs := opts.Environments
	if envs == nil && opts.CollectionRoot != "" {
		if res := envSvc.List(opts.CollectionRoot); res.Success {
			if list, ok := res.Data.([]model.Environment); ok {
				envs = list
			}
		}
	}
	if envs == nil {
		envs = []model.Environment{}
	}

	activeEnvID := strings.TrimSpace(opts.ActiveEnvID)
	if activeEnvID == "" && coll.ActiveEnvID != "" {
		activeEnvID = strings.TrimSpace(coll.ActiveEnvID)
	}
	if activeEnvID != "" {
		for _, e := range envs {
			if strings.EqualFold(e.ID, activeEnvID) || strings.EqualFold(strings.TrimSpace(e.Name), activeEnvID) {
				activeEnvID = e.ID
				break
			}
		}
	}
	coll.ActiveEnvID = activeEnvID

	// Preload request catalog and folder tree from CollectionRoot
	reqCatalog := map[string]preloadedRequestEntry{}
	allFolders := []model.TreeNode{}
	if opts.CollectionRoot != "" {
		if treeRes := collSvc.GetTree(opts.CollectionRoot); treeRes.Success {
			if treeNodes, ok := treeRes.Data.([]model.TreeNode); ok {
				collectPreloadedRequestsAndFolders(fs, treeNodes, nil, reqCatalog, &allFolders)
			}
		}
	}

	resolveStepRequest := func(requestID string) (model.Request, []model.TreeNode, bool) {
		trimmedID := strings.TrimSpace(requestID)
		if trimmedID == "" {
			return model.Request{}, nil, false
		}
		if entry, ok := reqCatalog[trimmedID]; ok {
			return deepCopyViaJSON(entry.request), syncPathFoldersFromAllFolders(entry.pathFolders, allFolders), true
		}
		if opts.CollectionRoot != "" {
			if req, pf, _, err := collSvc.ResolveRequestSelector(opts.CollectionRoot, trimmedID); err == nil {
				entry := preloadedRequestEntry{
					request:     req,
					pathFolders: pf,
				}
				reqCatalog[req.ID] = entry
				reqCatalog[trimmedID] = entry
				return deepCopyViaJSON(req), syncPathFoldersFromAllFolders(pf, allFolders), true
			}
		}
		return model.Request{}, nil, false
	}

	vm, _, err := newHeadlessRuntime()
	if err != nil {
		return nil, err
	}

	flow := opts.Flow
	maxSteps := flow.MaxSteps
	if maxSteps <= 0 {
		maxSteps = service.DefaultFlowMaxSteps
	}
	flowTimeoutMs := flow.TimeoutMs
	if flowTimeoutMs <= 0 {
		flowTimeoutMs = service.DefaultFlowTimeoutMs
	}
	if opts.TimeoutMs > 0 {
		flowTimeoutMs = opts.TimeoutMs
	}

	var activeEnvPtr *string
	if activeEnvID != "" {
		activeEnvPtr = &activeEnvID
	}

	runtimeVarOverrides := cloneStringMap(opts.CLIVarOverrides)
	accumulatedFolderIDs := []string{}

	// Initialize resolvedVariables from initial state
	initialMerged, err := callMergeParallelScriptUpdates(vm, headlessMutableJSState{
		Collection:           coll,
		Environments:         envs,
		ActiveEnvID:          activeEnvPtr,
		AllFolders:           allFolders,
		CLIVarOverrides:      runtimeVarOverrides,
		OrderedStepFolderIDs: accumulatedFolderIDs,
	}, nil)
	if err != nil {
		return nil, err
	}
	resolvedVariables := initialMerged.ResolvedVariables
	if resolvedVariables == nil {
		resolvedVariables = map[string]string{}
	}

	out := &FlowRunOutput{
		FlowID:      flow.ID,
		FlowName:    flow.Name,
		Status:      "passed",
		NodeResults: []FlowNodeRunOutput{},
		StepResults: []FlowStepRunOutput{},
	}

	halted := false
	unhandledFailure := false

	var markNodesSkipped func(nodes []model.FlowNode)
	markNodesSkipped = func(nodes []model.FlowNode) {
		for _, node := range nodes {
			stepResList := make([]FlowStepRunOutput, 0, len(node.Steps))
			for _, step := range node.Steps {
				reqName := ""
				method := ""
				if entry, ok := reqCatalog[strings.TrimSpace(step.RequestID)]; ok {
					reqName = entry.request.Name
					method = entry.request.Method
				}
				sr := FlowStepRunOutput{
					StepID:      step.ID,
					NodeID:      node.ID,
					RequestID:   step.RequestID,
					RequestName: reqName,
					Method:      method,
					Status:      "skipped",
				}
				stepResList = append(stepResList, sr)
				out.StepResults = append(out.StepResults, sr)
				out.StepsSkipped++
			}
			out.NodeResults = append(out.NodeResults, FlowNodeRunOutput{
				NodeID:      node.ID,
				Status:      "skipped",
				StepResults: stepResList,
			})
			for _, br := range node.Branches {
				if len(br.Nodes) > 0 {
					markNodesSkipped(br.Nodes)
				}
			}
		}
	}

	type rawExecutedStep struct {
		stepIdx     int
		step        model.FlowStep
		req         model.Request
		pathFolders []model.TreeNode
		missing     bool
		runOut      *RunOutput
	}

	buildBranchCtxForStep := func(st *rawExecutedStep) branchEvalJSContext {
		ctx := branchEvalJSContext{
			Variables: resolvedVariables,
		}
		if st != nil {
			ctx.RequestMissing = st.missing
			if st.runOut != nil {
				ctx.StatusCode = st.runOut.StatusCode
				ctx.ResponseBody = st.runOut.Body
				ctx.NetworkError = st.runOut.NetworkError
			}
		}
		return ctx
	}

	var executeNodeList func(nodes []model.FlowNode) error
	executeNodeList = func(nodes []model.FlowNode) error {
		for nodeIdx, node := range nodes {
			if halted {
				markNodesSkipped(nodes[nodeIdx:])
				return nil
			}

			// Partition steps in node into enabled vs disabled
			enabledIndices := []int{}
			for i, st := range node.Steps {
				if st.Enabled {
					enabledIndices = append(enabledIndices, i)
				}
			}

			// If no enabled steps in this node, mark all steps and branches as skipped and continue
			if len(enabledIndices) == 0 {
				stepResList := make([]FlowStepRunOutput, 0, len(node.Steps))
				for _, step := range node.Steps {
					reqName := ""
					method := ""
					if entry, ok := reqCatalog[strings.TrimSpace(step.RequestID)]; ok {
						reqName = entry.request.Name
						method = entry.request.Method
					}
					sr := FlowStepRunOutput{
						StepID:      step.ID,
						NodeID:      node.ID,
						RequestID:   step.RequestID,
						RequestName: reqName,
						Method:      method,
						Status:      "skipped",
					}
					stepResList = append(stepResList, sr)
					out.StepResults = append(out.StepResults, sr)
					out.StepsSkipped++
				}
				out.NodeResults = append(out.NodeResults, FlowNodeRunOutput{
					NodeID:      node.ID,
					Status:      "skipped",
					StepResults: stepResList,
				})
				for _, br := range node.Branches {
					if len(br.Nodes) > 0 {
						markNodesSkipped(br.Nodes)
					}
				}
				continue
			}

			// Enforce maxSteps limit before running enabled steps
			if out.StepsExecuted >= maxSteps {
				out.HaltedError = fmt.Sprintf("Đã vượt quá giới hạn số bước thực thi tối đa (max_steps = %d)", maxSteps)
				halted = true
				unhandledFailure = true
				markNodesSkipped(nodes[nodeIdx:])
				return nil
			}

			hitMaxStepsMidRow := false
			stepsToRunIndices := enabledIndices
			if out.StepsExecuted+len(enabledIndices) > maxSteps {
				allowed := maxSteps - out.StepsExecuted
				stepsToRunIndices = enabledIndices[:allowed]
				hitMaxStepsMidRow = true
			}

			// Pre-resolve requests on the main goroutine before launching any parallel goroutines
			preparedSteps := make([]rawExecutedStep, len(stepsToRunIndices))
			for k, stepIdx := range stepsToRunIndices {
				st := node.Steps[stepIdx]
				req, pf, found := resolveStepRequest(st.RequestID)
				for _, folderNode := range pf {
					accumulatedFolderIDs = appendOrderedFolderID(accumulatedFolderIDs, folderNode.ID)
				}
				preparedSteps[k] = rawExecutedStep{
					stepIdx:     stepIdx,
					step:        st,
					req:         req,
					pathFolders: pf,
					missing:     !found,
				}
			}

			// Execute either sequentially (1 step) or concurrently via goroutines (>= 2 steps)
			if len(preparedSteps) == 1 {
				ps := &preparedSteps[0]
				if !ps.missing {
					effTimeoutMs := ps.step.TimeoutMs
					if effTimeoutMs <= 0 {
						effTimeoutMs = flowTimeoutMs
					}
					runOut, _ := ExecuteRequestFlow(RunOptions{
						FS:              fs,
						CollectionSvc:   collSvc,
						EnvSvc:          envSvc,
						RequestSvc:      reqSvc,
						ExecutorSvc:     execSvc,
						HistorySvc:      historySvc,
						CollectionsRoot: opts.CollectionsRoot,
						CollectionRoot:  opts.CollectionRoot,
						Collection:      deepCopyViaJSON(coll),
						Request:         deepCopyViaJSON(ps.req),
						PathFolders:     deepCopyViaJSON(ps.pathFolders),
						AllFolders:      deepCopyViaJSON(allFolders),
						Environments:    deepCopyViaJSON(envs),
						ActiveEnvID:     activeEnvID,
						CLIVarOverrides: cloneStringMap(runtimeVarOverrides),
						TimeoutMs:       effTimeoutMs,
						NoSaveEnv:       true,
					})
					ps.runOut = runOut
				}
			} else {
				// Parallel Row: clone input context for each goroutine and run with NoSaveEnv: true
				type goroutineInput struct {
					coll            model.Collection
					req             model.Request
					pathFolders     []model.TreeNode
					allFolders      []model.TreeNode
					envs            []model.Environment
					cliVarOverrides map[string]string
					timeoutMs       int
				}
				gInputs := make([]goroutineInput, len(preparedSteps))
				for k := range preparedSteps {
					ps := &preparedSteps[k]
					effTimeoutMs := ps.step.TimeoutMs
					if effTimeoutMs <= 0 {
						effTimeoutMs = flowTimeoutMs
					}
					gInputs[k] = goroutineInput{
						coll:            deepCopyViaJSON(coll),
						req:             deepCopyViaJSON(ps.req),
						pathFolders:     deepCopyViaJSON(ps.pathFolders),
						allFolders:      deepCopyViaJSON(allFolders),
						envs:            deepCopyViaJSON(envs),
						cliVarOverrides: cloneStringMap(runtimeVarOverrides),
						timeoutMs:       effTimeoutMs,
					}
				}

				var wg sync.WaitGroup
				for k := range preparedSteps {
					if preparedSteps[k].missing {
						continue
					}
					wg.Add(1)
					go func(idx int, gin goroutineInput) {
						defer wg.Done()
						runOut, _ := ExecuteRequestFlow(RunOptions{
							FS:              fs,
							CollectionSvc:   collSvc,
							EnvSvc:          envSvc,
							RequestSvc:      reqSvc,
							ExecutorSvc:     execSvc,
							HistorySvc:      historySvc,
							CollectionsRoot: opts.CollectionsRoot,
							CollectionRoot:  opts.CollectionRoot,
							Collection:      gin.coll,
							Request:         gin.req,
							PathFolders:     gin.pathFolders,
							AllFolders:      gin.allFolders,
							Environments:    gin.envs,
							ActiveEnvID:     activeEnvID,
							CLIVarOverrides: gin.cliVarOverrides,
							TimeoutMs:       gin.timeoutMs,
							NoSaveEnv:       true,
						})
						preparedSteps[idx].runOut = runOut
					}(k, gInputs[k])
				}
				wg.Wait()
			}

			// Merge script updates in declaration order via goja and persist to disk once
			mutationItems := make([]parallelStepMutationJSItem, 0, len(preparedSteps))
			for _, ps := range preparedSteps {
				if ps.missing || ps.runOut == nil {
					mutationItems = append(mutationItems, parallelStepMutationJSItem{
						StepID:      ps.step.ID,
						RequestID:   ps.step.RequestID,
						PathFolders: ps.pathFolders,
					})
					continue
				}
				mutationItems = append(mutationItems, parallelStepMutationJSItem{
					StepID:            ps.step.ID,
					RequestID:         ps.step.RequestID,
					PathFolders:       ps.pathFolders,
					EnvUpdates:        ps.runOut.EnvUpdates,
					ScopedEnvUpdates:  ps.runOut.ScopedEnvUpdates,
					ScopedAuthUpdates: ps.runOut.ScopedAuthUpdates,
				})
			}

			mergedState, err := callMergeParallelScriptUpdates(vm, headlessMutableJSState{
				Collection:           coll,
				Environments:         envs,
				ActiveEnvID:          activeEnvPtr,
				AllFolders:           allFolders,
				CLIVarOverrides:      runtimeVarOverrides,
				OrderedStepFolderIDs: accumulatedFolderIDs,
			}, mutationItems)
			if err != nil {
				return err
			}

			pruneMutatedCLIVarOverrides(runtimeVarOverrides, &mergedState.MergedScriptResult)
			for fid := range mergedState.MergedScriptResult.ScopedEnvUpdates.FolderGlobals {
				accumulatedFolderIDs = appendOrderedFolderID(accumulatedFolderIDs, fid)
			}
			for _, fe := range mergedState.MergedScriptResult.ScopedEnvUpdates.FolderEnvs {
				accumulatedFolderIDs = appendOrderedFolderID(accumulatedFolderIDs, fe.Folder)
			}

			coll = mergedState.Collection
			coll.ActiveEnvID = activeEnvID
			envs = mergedState.Environments
			allFolders = mergedState.AllFolders
			if mergedState.ResolvedVariables != nil {
				resolvedVariables = mergedState.ResolvedVariables
			}

			var diskPersistErr error
			if !opts.NoSaveEnv && opts.CollectionRoot != "" && hasScriptExecutionUpdates(&mergedState.MergedScriptResult) {
				diskPersistErr = ApplyScriptUpdatesToDisk(
					fs,
					collSvc,
					envSvc,
					opts.CollectionsRoot,
					opts.CollectionRoot,
					&coll,
					activeEnvID,
					nil,
					allFolders,
					&mergedState.MergedScriptResult,
				)
				coll.ActiveEnvID = activeEnvID
			}

			// Evaluate step verdicts in declaration order and build FlowStepRunOutput list
			executedByStepIdx := make(map[int]FlowStepRunOutput, len(preparedSteps))
			var firstFailedStep *rawExecutedStep
			var firstFailedReason string
			var lastExecutedStep *rawExecutedStep
			nodePassed := true

			for i := range preparedSteps {
				ps := &preparedSteps[i]
				lastExecutedStep = ps
				out.StepsExecuted++

				if ps.missing {
					verdict, err := callEvaluateStepVerdict(vm, stepVerdictJSInput{
						RequestMissing: true,
					})
					if err != nil {
						return err
					}
					sr := FlowStepRunOutput{
						StepID:          ps.step.ID,
						NodeID:          node.ID,
						RequestID:       ps.step.RequestID,
						Status:          "failed",
						FailureCategory: verdict.FailureCategory,
						FailureReason:   verdict.FailureReason,
					}
					executedByStepIdx[ps.stepIdx] = sr
					out.StepsFailed++
					nodePassed = false
					if firstFailedStep == nil {
						firstFailedStep = ps
						firstFailedReason = sr.FailureReason
					}
					continue
				}

				if diskPersistErr != nil && ps.runOut != nil {
					if ps.runOut.ScriptError != "" {
						ps.runOut.ScriptError += "; " + diskPersistErr.Error()
					} else {
						ps.runOut.ScriptError = diskPersistErr.Error()
					}
				}

				vIn := stepVerdictJSInput{}
				if ps.runOut != nil {
					vIn.NetworkError = ps.runOut.NetworkError
					vIn.ScriptError = ps.runOut.ScriptError
					vIn.ScriptTests = ps.runOut.ScriptTests
					vIn.StatusCode = ps.runOut.StatusCode
				} else {
					vIn.NetworkError = "request execution returned nil output"
				}

				verdict, err := callEvaluateStepVerdict(vm, vIn)
				if err != nil {
					return err
				}

				status := "passed"
				if !verdict.Passed {
					status = "failed"
					out.StepsFailed++
					nodePassed = false
					if firstFailedStep == nil {
						firstFailedStep = ps
						firstFailedReason = verdict.FailureReason
					}
				} else {
					out.StepsPassed++
				}

				executedByStepIdx[ps.stepIdx] = FlowStepRunOutput{
					StepID:          ps.step.ID,
					NodeID:          node.ID,
					RequestID:       ps.step.RequestID,
					RequestName:     ps.req.Name,
					Method:          ps.req.Method,
					Status:          status,
					FailureCategory: verdict.FailureCategory,
					FailureReason:   verdict.FailureReason,
					RunOutput:       ps.runOut,
				}
			}

			nodeStepResults := make([]FlowStepRunOutput, 0, len(node.Steps))
			for idx, st := range node.Steps {
				if sr, ok := executedByStepIdx[idx]; ok {
					nodeStepResults = append(nodeStepResults, sr)
					out.StepResults = append(out.StepResults, sr)
				} else {
					reqName := ""
					method := ""
					if entry, ok := reqCatalog[strings.TrimSpace(st.RequestID)]; ok {
						reqName = entry.request.Name
						method = entry.request.Method
					}
					sr := FlowStepRunOutput{
						StepID:      st.ID,
						NodeID:      node.ID,
						RequestID:   st.RequestID,
						RequestName: reqName,
						Method:      method,
						Status:      "skipped",
					}
					nodeStepResults = append(nodeStepResults, sr)
					out.StepResults = append(out.StepResults, sr)
					out.StepsSkipped++
				}
			}

			nodeStatus := "passed"
			if !nodePassed || hitMaxStepsMidRow {
				nodeStatus = "failed"
			}

			nodeResIndex := len(out.NodeResults)
			out.NodeResults = append(out.NodeResults, FlowNodeRunOutput{
				NodeID:      node.ID,
				Status:      nodeStatus,
				StepResults: nodeStepResults,
			})

			if hitMaxStepsMidRow {
				out.HaltedError = fmt.Sprintf("Đã vượt quá giới hạn số bước thực thi tối đa (max_steps = %d)", maxSteps)
				halted = true
				unhandledFailure = true
				for _, br := range node.Branches {
					if len(br.Nodes) > 0 {
						markNodesSkipped(br.Nodes)
					}
				}
				if nodeIdx+1 < len(nodes) {
					markNodesSkipped(nodes[nodeIdx+1:])
				}
				return nil
			}

			// Case 1: Node has no branches
			if len(node.Branches) == 0 {
				if !nodePassed {
					halted = true
					unhandledFailure = true
					if out.HaltedError == "" {
						out.HaltedError = firstFailedReason
					}
					if nodeIdx+1 < len(nodes) {
						markNodesSkipped(nodes[nodeIdx+1:])
					}
					return nil
				}
				continue
			}

			// Case 2: Node has branches -> evaluate custom branches first (including across parallel steps)
			repStep := lastExecutedStep
			if !nodePassed && firstFailedStep != nil {
				repStep = firstFailedStep
			}

			matchedBranchID := ""
			for _, br := range node.Branches {
				if strings.EqualFold(strings.TrimSpace(br.Condition.Type), "custom") {
					okMatch, err := callEvaluateCustomBranchCondition(vm, br.Condition, buildBranchCtxForStep(repStep))
					if err != nil {
						return err
					}
					if !okMatch && len(preparedSteps) >= 2 {
						for i := range preparedSteps {
							cand := &preparedSteps[i]
							if cand == repStep {
								continue
							}
							candMatch, err := callEvaluateCustomBranchCondition(vm, br.Condition, buildBranchCtxForStep(cand))
							if err != nil {
								return err
							}
							if candMatch {
								okMatch = true
								break
							}
						}
					}
					if okMatch {
						matchedBranchID = strings.TrimSpace(br.ID)
						break
					}
				}
			}

			if matchedBranchID == "" {
				branchSel, err := callSelectMatchingBranch(vm, node.Branches, nodePassed, buildBranchCtxForStep(repStep))
				if err != nil {
					return err
				}
				if branchSel.MatchedBranchID != nil {
					matchedBranchID = strings.TrimSpace(*branchSel.MatchedBranchID)
				}
			}
			out.NodeResults[nodeResIndex].MatchedBranchID = matchedBranchID

			if matchedBranchID == "" {
				// No branch matched -> mark all branches as skipped
				for _, br := range node.Branches {
					if len(br.Nodes) > 0 {
						markNodesSkipped(br.Nodes)
					}
				}
				if !nodePassed {
					halted = true
					unhandledFailure = true
					if out.HaltedError == "" {
						out.HaltedError = firstFailedReason
					}
					if nodeIdx+1 < len(nodes) {
						markNodesSkipped(nodes[nodeIdx+1:])
					}
					return nil
				}
				continue
			}

			// Execute matched branch and mark non-matched branches as skipped
			for _, br := range node.Branches {
				if br.ID == matchedBranchID {
					if len(br.Nodes) > 0 {
						if err := executeNodeList(br.Nodes); err != nil {
							return err
						}
					}
				} else if len(br.Nodes) > 0 {
					markNodesSkipped(br.Nodes)
				}
			}

			if halted {
				if nodeIdx+1 < len(nodes) {
					markNodesSkipped(nodes[nodeIdx+1:])
				}
				return nil
			}
			// If matchedBranch completed without halting, any error on this node was handled by the branch!
		}
		return nil
	}

	if err := executeNodeList(flow.Nodes); err != nil {
		return nil, err
	}

	if halted || unhandledFailure || out.HaltedError != "" {
		out.Status = "failed"
	} else {
		out.Status = "passed"
	}

	out.TotalTimeMs = time.Since(startTime).Milliseconds()
	return out, nil
}
