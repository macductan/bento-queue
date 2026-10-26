package engine

import (
	_ "embed"
	"encoding/base64"
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

//go:embed headless-engine.js
var headlessBundleJS string

const headlessPolyfillJS = `
var globalThis = (typeof globalThis !== 'undefined') ? globalThis : this;
var window = globalThis;
var self = globalThis;
class TextEncoder {
	encode(str) {
		return new Uint8Array(__goUtf8Encode(str === undefined ? "" : String(str)));
	}
}
class TextDecoder {
	decode(input) {
		if (!input) return "";
		var bytes = input instanceof ArrayBuffer
			? new Uint8Array(input)
			: ArrayBuffer.isView(input)
				? new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
				: input;
		return __goUtf8Decode(Array.from(bytes));
	}
}
globalThis.TextEncoder = TextEncoder;
globalThis.TextDecoder = TextDecoder;
`

var (
	compiledBundleOnce sync.Once
	compiledBundleProg *goja.Program
	compiledBundleErr  error
)

func getCompiledHeadlessProgram() (*goja.Program, error) {
	compiledBundleOnce.Do(func() {
		compiledBundleProg, compiledBundleErr = goja.Compile(
			"headless-engine.js",
			headlessPolyfillJS+"\n"+headlessBundleJS,
			false,
		)
	})
	return compiledBundleProg, compiledBundleErr
}

// ScriptTestResult represents a single ha.test(...) assertion result.
type ScriptTestResult struct {
	Name   string `json:"name"`
	Passed bool   `json:"passed"`
	Error  string `json:"error,omitempty"`
}

// FolderEnvUpdateItem represents a Tier-4 (folder + environment) variable mutation from a script.
type FolderEnvUpdateItem struct {
	Folder string `json:"folder"`
	Env    string `json:"env"`
	Key    string `json:"key"`
	Value  string `json:"value"`
}

// ScopedEnvUpdates captures scoped variable mutations produced by pre/post scripts.
type ScopedEnvUpdates struct {
	Collection    map[string]string            `json:"collection,omitempty"`
	GlobalEnvs    map[string]map[string]string `json:"globalEnvs,omitempty"`
	FolderGlobals map[string]map[string]string `json:"folderGlobals,omitempty"`
	FolderEnvs    []FolderEnvUpdateItem        `json:"folderEnvs,omitempty"`
}

// FolderAuthEnvUpdateItem represents a folder + environment auth mutation from a script.
type FolderAuthEnvUpdateItem struct {
	Folder string            `json:"folder"`
	Env    string            `json:"env"`
	Auth   *model.AuthConfig `json:"auth"`
}

// CollectionAuthEnvUpdateItem represents a collection + environment auth mutation from a script.
type CollectionAuthEnvUpdateItem struct {
	Env  string            `json:"env"`
	Auth *model.AuthConfig `json:"auth"`
}

// ScopedAuthUpdates captures scoped authentication mutations produced by pre/post scripts.
type ScopedAuthUpdates struct {
	FolderGlobals    map[string]*model.AuthConfig  `json:"folderGlobals,omitempty"`
	FolderEnvs       []FolderAuthEnvUpdateItem     `json:"folderEnvs,omitempty"`
	CollectionGlobal *model.AuthConfig             `json:"collectionGlobal,omitempty"`
	CollectionEnvs   []CollectionAuthEnvUpdateItem `json:"collectionEnvs,omitempty"`
}

// ScriptExecutionResult mirrors the TypeScript ScriptExecutionResult structure.
type ScriptExecutionResult struct {
	Success           bool               `json:"success"`
	Logs              []string           `json:"logs"`
	TestResults       []ScriptTestResult `json:"testResults"`
	EnvUpdates        map[string]string  `json:"envUpdates"`
	ScopedEnvUpdates  ScopedEnvUpdates   `json:"scopedEnvUpdates"`
	ScopedAuthUpdates ScopedAuthUpdates  `json:"scopedAuthUpdates"`
	Error             string             `json:"error,omitempty"`
}

// RunOutput is the canonical execution output returned by ExecuteRequestFlow and `hecto run`.
type RunOutput struct {
	StatusCode        int                    `json:"status_code"`
	StatusText        string                 `json:"status_text"`
	TimeMs            int64                  `json:"time_ms"`
	SizeBytes         int64                  `json:"size_bytes"`
	Headers           map[string][]string    `json:"headers"`
	Body              string                 `json:"body"`
	Request           model.ExecuteRequest   `json:"request"`
	ResolvedRequest   model.ExecuteRequest   `json:"resolved_request"`
	Response          *model.ExecuteResponse `json:"response,omitempty"`
	ScriptTests       []ScriptTestResult     `json:"script_tests"`
	ScriptLogs        []string               `json:"script_logs"`
	ConsoleLogs       []string               `json:"console_logs"`
	EnvUpdates        map[string]string      `json:"env_updates,omitempty"`
	ScopedEnvUpdates  *ScopedEnvUpdates      `json:"scoped_env_updates,omitempty"`
	ScopedAuthUpdates *ScopedAuthUpdates     `json:"scoped_auth_updates,omitempty"`
	ScriptError       string                 `json:"script_error,omitempty"`
	NetworkError      string                 `json:"network_error,omitempty"`
}

// RunOptions configures a single ExecuteRequestFlow invocation.
type RunOptions struct {
	FS              *storage.FileSystem
	CollectionSvc   *service.CollectionService
	EnvSvc          *service.EnvironmentService
	RequestSvc      *service.RequestService
	ExecutorSvc     *service.ExecutorService
	HistorySvc      *service.HistoryService
	CollectionsRoot string
	CollectionRoot  string
	Collection      model.Collection
	Request         model.Request
	PathFolders     []model.TreeNode
	AllFolders      []model.TreeNode
	Environments    []model.Environment
	ActiveEnvID     string
	CLIVarOverrides map[string]string
	TimeoutSec      int
	TimeoutMs       int
	NoSaveEnv       bool
}

type headlessPreInput struct {
	Request         model.Request       `json:"request"`
	Collection      model.Collection    `json:"collection"`
	Environments    []model.Environment `json:"environments"`
	ActiveEnvID     *string             `json:"activeEnvId"`
	PathFolders     []model.TreeNode    `json:"pathFolders"`
	AllFolders      []model.TreeNode    `json:"allFolders"`
	CLIVarOverrides map[string]string   `json:"cliVarOverrides,omitempty"`
}

type headlessPreOutput struct {
	ExecuteRequest      model.ExecuteRequest   `json:"executeRequest"`
	EffectiveRequest    model.Request          `json:"effectiveRequest"`
	ResolvedVariables   map[string]string      `json:"resolvedVariables"`
	PreScriptResult     *ScriptExecutionResult `json:"preScriptResult"`
	MutatedCollection   model.Collection       `json:"mutatedCollection"`
	MutatedEnvironments []model.Environment    `json:"mutatedEnvironments"`
	MutatedPathFolders  []model.TreeNode       `json:"mutatedPathFolders"`
	MutatedAllFolders   []model.TreeNode       `json:"mutatedAllFolders"`
}

type headlessPostInput struct {
	EffectiveRequest  model.Request         `json:"effectiveRequest"`
	Response          model.ExecuteResponse `json:"response"`
	ResolvedVariables map[string]string     `json:"resolvedVariables"`
	Collection        model.Collection      `json:"collection"`
	Environments      []model.Environment   `json:"environments"`
	ActiveEnvID       *string               `json:"activeEnvId"`
	PathFolders       []model.TreeNode      `json:"pathFolders"`
	AllFolders        []model.TreeNode      `json:"allFolders"`
	CLIVarOverrides   map[string]string     `json:"cliVarOverrides,omitempty"`
}

// newHeadlessRuntime creates a pure-Go goja JS VM with Latin-1 byte-per-rune btoa/atob,
// TextEncoder, TextDecoder, and console polyfills, then runs the pre-compiled headless-engine.js program.
func newHeadlessRuntime() (*goja.Runtime, *[]string, error) {
	vm := goja.New()
	var runtimeLogs []string

	// 1. Latin-1 (byte-per-rune) btoa polyfill:
	// Rejects any rune > 0xFF with InvalidCharacterError and converts each rune r <= 0xFF to byte(r)
	// before Base64 encoding. This guarantees 100% compatibility with TextEncoder + String.fromCharCode
	// and unescape(encodeURIComponent(str)) for Vietnamese/Unicode Basic Auth credentials.
	if err := vm.Set("btoa", func(call goja.FunctionCall) goja.Value {
		if len(call.Arguments) == 0 {
			panic(vm.NewTypeError("btoa requires at least 1 argument"))
		}
		s := call.Argument(0).String()
		runes := []rune(s)
		buf := make([]byte, len(runes))
		for i, r := range runes {
			if r > 0xFF {
				panic(vm.NewGoError(fmt.Errorf("InvalidCharacterError: The string to be encoded contains characters outside of the Latin1 range")))
			}
			buf[i] = byte(r)
		}
		return vm.ToValue(base64.StdEncoding.EncodeToString(buf))
	}); err != nil {
		return nil, nil, err
	}

	// 2. Latin-1 (byte-per-rune) atob polyfill:
	// Decodes Base64 into raw bytes and maps each byte b to rune(b).
	if err := vm.Set("atob", func(call goja.FunctionCall) goja.Value {
		if len(call.Arguments) == 0 {
			panic(vm.NewTypeError("atob requires at least 1 argument"))
		}
		b64 := strings.TrimSpace(call.Argument(0).String())
		decoded, err := base64.StdEncoding.DecodeString(b64)
		if err != nil {
			decoded, err = base64.RawStdEncoding.DecodeString(b64)
			if err != nil {
				panic(vm.NewGoError(fmt.Errorf("InvalidCharacterError: The string to be decoded is not correctly encoded")))
			}
		}
		runes := make([]rune, len(decoded))
		for i, b := range decoded {
			runes[i] = rune(b)
		}
		return vm.ToValue(string(runes))
	}); err != nil {
		return nil, nil, err
	}

	// 3. Native UTF-8 helpers backing TextEncoder and TextDecoder
	if err := vm.Set("__goUtf8Encode", func(call goja.FunctionCall) goja.Value {
		s := ""
		if len(call.Arguments) > 0 && !goja.IsUndefined(call.Argument(0)) && !goja.IsNull(call.Argument(0)) {
			s = call.Argument(0).String()
		}
		raw := []byte(s)
		ints := make([]int, len(raw))
		for i, b := range raw {
			ints[i] = int(b)
		}
		return vm.ToValue(ints)
	}); err != nil {
		return nil, nil, err
	}

	if err := vm.Set("__goUtf8Decode", func(call goja.FunctionCall) goja.Value {
		if len(call.Arguments) == 0 || goja.IsUndefined(call.Argument(0)) || goja.IsNull(call.Argument(0)) {
			return vm.ToValue("")
		}
		exported := call.Argument(0).Export()
		switch v := exported.(type) {
		case []byte:
			return vm.ToValue(string(v))
		case []interface{}:
			buf := make([]byte, len(v))
			for i, elem := range v {
				switch n := elem.(type) {
				case int64:
					buf[i] = byte(n)
				case int:
					buf[i] = byte(n)
				case float64:
					buf[i] = byte(n)
				}
			}
			return vm.ToValue(string(buf))
		default:
			return vm.ToValue("")
		}
	}); err != nil {
		return nil, nil, err
	}

	// 4. Console polyfill (captures logs into runtimeLogs, never prints to stdout)
	consoleObj := vm.NewObject()
	makeConsoleFn := func(level string) func(call goja.FunctionCall) goja.Value {
		return func(call goja.FunctionCall) goja.Value {
			parts := make([]string, len(call.Arguments))
			for i, arg := range call.Arguments {
				parts[i] = arg.String()
			}
			msg := strings.Join(parts, " ")
			if level != "log" {
				msg = fmt.Sprintf("[%s] %s", strings.ToUpper(level), msg)
			}
			runtimeLogs = append(runtimeLogs, msg)
			return goja.Undefined()
		}
	}
	_ = consoleObj.Set("log", makeConsoleFn("log"))
	_ = consoleObj.Set("info", makeConsoleFn("info"))
	_ = consoleObj.Set("warn", makeConsoleFn("warn"))
	_ = consoleObj.Set("error", makeConsoleFn("error"))
	_ = consoleObj.Set("debug", makeConsoleFn("log"))
	if err := vm.Set("console", consoleObj); err != nil {
		return nil, nil, err
	}

	// 5. Run pre-compiled polyfills + headless-engine.js program
	prog, err := getCompiledHeadlessProgram()
	if err != nil {
		return nil, nil, fmt.Errorf("failed to compile headless-engine.js: %w", err)
	}
	if _, err := vm.RunProgram(prog); err != nil {
		return nil, nil, fmt.Errorf("failed to evaluate headless-engine.js: %w", err)
	}

	return vm, &runtimeLogs, nil
}

func callEngineJSON(vm *goja.Runtime, fnName string, input interface{}, output interface{}) error {
	inputBytes, err := json.Marshal(input)
	if err != nil {
		return fmt.Errorf("failed to marshal input for %s: %w", fnName, err)
	}
	if err := vm.Set("__hectoInputJSON", string(inputBytes)); err != nil {
		return err
	}
	script := fmt.Sprintf(`JSON.stringify(globalThis.HectoEngine.%s(JSON.parse(__hectoInputJSON)))`, fnName)
	val, err := vm.RunString(script)
	if err != nil {
		return fmt.Errorf("goja %s failed: %w", fnName, err)
	}
	if goja.IsUndefined(val) || goja.IsNull(val) {
		return nil
	}
	outStr := val.String()
	if outStr == "" || outStr == "null" || outStr == "undefined" {
		return nil
	}
	if err := json.Unmarshal([]byte(outStr), output); err != nil {
		return fmt.Errorf("failed to unmarshal output from %s: %w", fnName, err)
	}
	return nil
}

// IsCurlCommand checks if the given string starts with a curl command invocation.
func IsCurlCommand(raw string) bool {
	trimmed := strings.TrimSpace(raw)
	if len(trimmed) < 5 {
		return false
	}
	prefix := strings.ToLower(trimmed[:4])
	if prefix != "curl" {
		return false
	}
	next := trimmed[4]
	return next == ' ' || next == '\t' || next == '\n' || next == '\r' || next == '\\'
}

// ParseCurl parses a raw curl command string into a model.Request using the shared TS engine.
func ParseCurl(rawCommand string) (*model.Request, error) {
	if !IsCurlCommand(rawCommand) {
		return nil, fmt.Errorf("%s: input is not a valid curl command", model.ErrValidation)
	}
	vm, _, err := newHeadlessRuntime()
	if err != nil {
		return nil, err
	}
	if err := vm.Set("__rawCurl", rawCommand); err != nil {
		return nil, err
	}
	val, err := vm.RunString(`JSON.stringify(globalThis.HectoEngine.parseCurlCommand(__rawCurl))`)
	if err != nil {
		return nil, fmt.Errorf("%s: %v", model.ErrParse, err)
	}
	var req model.Request
	if err := json.Unmarshal([]byte(val.String()), &req); err != nil {
		return nil, fmt.Errorf("%s: %v", model.ErrParse, err)
	}
	if strings.TrimSpace(req.URL) == "" {
		return nil, fmt.Errorf("%s: curl command does not contain a valid URL", model.ErrParse)
	}
	if strings.TrimSpace(req.Method) == "" {
		req.Method = "GET"
	}
	if strings.TrimSpace(req.Name) == "" {
		req.Name = fmt.Sprintf("%s %s", req.Method, req.URL)
	}
	if req.Auth == nil {
		req.Auth = &model.AuthConfig{Type: "inherit"}
	}
	return &req, nil
}

// ReconcileRequestURLAndParams synchronizes req.URL, req.Params, and req.PathParams bidirectionally
// using the shared TS engine (`reconcileUrlAndParams`).
func ReconcileRequestURLAndParams(req *model.Request) error {
	if req == nil {
		return nil
	}
	vm, _, err := newHeadlessRuntime()
	if err != nil {
		return err
	}
	payload := map[string]interface{}{
		"url":        req.URL,
		"params":     req.Params,
		"pathParams": req.PathParams,
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	if err := vm.Set("__reconcileInput", string(raw)); err != nil {
		return err
	}
	val, err := vm.RunString(`
		(function() {
			var inp = JSON.parse(__reconcileInput);
			return JSON.stringify(globalThis.HectoEngine.reconcileUrlAndParams(inp.url, inp.params, inp.pathParams));
		})()
	`)
	if err != nil {
		return err
	}
	var synced struct {
		URL        string         `json:"url"`
		Params     []model.KVPair `json:"params"`
		PathParams []model.KVPair `json:"path_params"`
	}
	if err := json.Unmarshal([]byte(val.String()), &synced); err != nil {
		return err
	}
	req.URL = synced.URL
	req.Params = synced.Params
	req.PathParams = synced.PathParams
	return nil
}

func upsertKVPairs(list []model.KVPair, updates map[string]string) []model.KVPair {
	if list == nil {
		list = []model.KVPair{}
	}
	for k, v := range updates {
		found := false
		for i := range list {
			if list[i].Key == k {
				list[i].Value = v
				list[i].Enabled = true
				found = true
				break
			}
		}
		if !found {
			list = append(list, model.KVPair{Key: k, Value: v, Enabled: true})
		}
	}
	return list
}

func hasScopedEnvUpdates(s *ScopedEnvUpdates) bool {
	if s == nil {
		return false
	}
	return len(s.Collection) > 0 || len(s.GlobalEnvs) > 0 || len(s.FolderGlobals) > 0 || len(s.FolderEnvs) > 0
}

func hasScopedAuthUpdates(s *ScopedAuthUpdates) bool {
	if s == nil {
		return false
	}
	return s.CollectionGlobal != nil || len(s.CollectionEnvs) > 0 || len(s.FolderGlobals) > 0 || len(s.FolderEnvs) > 0
}

func mergeScopedEnvUpdates(dst, src *ScopedEnvUpdates) *ScopedEnvUpdates {
	if !hasScopedEnvUpdates(dst) && !hasScopedEnvUpdates(src) {
		return nil
	}
	out := &ScopedEnvUpdates{
		Collection:    map[string]string{},
		GlobalEnvs:    map[string]map[string]string{},
		FolderGlobals: map[string]map[string]string{},
		FolderEnvs:    []FolderEnvUpdateItem{},
	}
	apply := func(in *ScopedEnvUpdates) {
		if in == nil {
			return
		}
		for k, v := range in.Collection {
			out.Collection[k] = v
		}
		for eKey, kv := range in.GlobalEnvs {
			if out.GlobalEnvs[eKey] == nil {
				out.GlobalEnvs[eKey] = map[string]string{}
			}
			for k, v := range kv {
				out.GlobalEnvs[eKey][k] = v
			}
		}
		for fKey, kv := range in.FolderGlobals {
			if out.FolderGlobals[fKey] == nil {
				out.FolderGlobals[fKey] = map[string]string{}
			}
			for k, v := range kv {
				out.FolderGlobals[fKey][k] = v
			}
		}
		for _, item := range in.FolderEnvs {
			replaced := false
			for i := range out.FolderEnvs {
				if out.FolderEnvs[i].Folder == item.Folder && out.FolderEnvs[i].Env == item.Env && out.FolderEnvs[i].Key == item.Key {
					out.FolderEnvs[i].Value = item.Value
					replaced = true
					break
				}
			}
			if !replaced {
				out.FolderEnvs = append(out.FolderEnvs, item)
			}
		}
	}
	apply(dst)
	apply(src)
	return out
}

func mergeScopedAuthUpdates(dst, src *ScopedAuthUpdates) *ScopedAuthUpdates {
	if !hasScopedAuthUpdates(dst) && !hasScopedAuthUpdates(src) {
		return nil
	}
	out := &ScopedAuthUpdates{
		FolderGlobals:  map[string]*model.AuthConfig{},
		FolderEnvs:     []FolderAuthEnvUpdateItem{},
		CollectionEnvs: []CollectionAuthEnvUpdateItem{},
	}
	apply := func(in *ScopedAuthUpdates) {
		if in == nil {
			return
		}
		if in.CollectionGlobal != nil {
			out.CollectionGlobal = in.CollectionGlobal
		}
		for _, item := range in.CollectionEnvs {
			replaced := false
			for i := range out.CollectionEnvs {
				if out.CollectionEnvs[i].Env == item.Env {
					out.CollectionEnvs[i].Auth = item.Auth
					replaced = true
					break
				}
			}
			if !replaced {
				out.CollectionEnvs = append(out.CollectionEnvs, item)
			}
		}
		for fKey, authCfg := range in.FolderGlobals {
			out.FolderGlobals[fKey] = authCfg
		}
		for _, item := range in.FolderEnvs {
			replaced := false
			for i := range out.FolderEnvs {
				if out.FolderEnvs[i].Folder == item.Folder && out.FolderEnvs[i].Env == item.Env {
					out.FolderEnvs[i].Auth = item.Auth
					replaced = true
					break
				}
			}
			if !replaced {
				out.FolderEnvs = append(out.FolderEnvs, item)
			}
		}
	}
	apply(dst)
	apply(src)
	return out
}

// ApplyScriptUpdatesToDisk persists envUpdates, scopedEnvUpdates, and scopedAuthUpdates to disk
// (Environment JSONs, Folder _folder.json files, and Collection collection.json), matching
// environmentStore.ts in the frontend 100%.
func ApplyScriptUpdatesToDisk(
	fs *storage.FileSystem,
	collSvc *service.CollectionService,
	envSvc *service.EnvironmentService,
	collectionsRoot string,
	collRoot string,
	coll *model.Collection,
	activeEnvID string,
	pathFolders []model.TreeNode,
	allFolders []model.TreeNode,
	scriptRes *ScriptExecutionResult,
) error {
	if scriptRes == nil || fs == nil || collRoot == "" {
		return nil
	}
	fs.SetCollectionRoot(collRoot)

	silentLogger := slog.New(slog.NewTextHandler(io.Discard, nil))
	if collSvc == nil {
		collSvc = service.NewCollectionService(fs, silentLogger)
	}
	if envSvc == nil {
		envSvc = service.NewEnvironmentService(fs, silentLogger)
	}
	if collectionsRoot == "" {
		collectionsRoot = filepath.Dir(collRoot)
	}

	// Load current environments for name/ID resolution
	var envs []model.Environment
	if envListRes := envSvc.List(collRoot); envListRes.Success {
		if list, ok := envListRes.Data.([]model.Environment); ok {
			envs = list
		}
	}

	resolveEnvID := func(selector string) string {
		trimmed := strings.TrimSpace(selector)
		if trimmed == "" || trimmed == "__active__" {
			return activeEnvID
		}
		for _, e := range envs {
			if strings.EqualFold(e.ID, trimmed) || strings.EqualFold(strings.TrimSpace(e.Name), trimmed) {
				return e.ID
			}
		}
		return trimmed
	}

	activeEnvID = resolveEnvID(activeEnvID)

	resolveFolderID := func(selector string) string {
		trimmed := strings.TrimSpace(selector)
		if trimmed == "" || trimmed == "__nearest__" {
			if len(pathFolders) > 0 {
				return pathFolders[len(pathFolders)-1].ID
			}
			return ""
		}
		if strings.Contains(trimmed, "/") {
			if node, _, err := collSvc.ResolveFolderSelector(collRoot, trimmed); err == nil {
				return node.ID
			}
		}
		for i := len(pathFolders) - 1; i >= 0; i-- {
			pf := pathFolders[i]
			if strings.EqualFold(pf.ID, trimmed) || strings.EqualFold(strings.TrimSpace(pf.Name), trimmed) {
				return pf.ID
			}
		}
		for _, af := range allFolders {
			if strings.EqualFold(af.ID, trimmed) || strings.EqualFold(strings.TrimSpace(af.Name), trimmed) {
				return af.ID
			}
		}
		if node, _, err := collSvc.ResolveFolderSelector(collRoot, trimmed); err == nil {
			return node.ID
		}
		return ""
	}

	collectionChanged := false
	collVarsToApply := map[string]string{}

	// 1. Default envUpdates: apply to active environment if present; otherwise fallback to collection variables
	if len(scriptRes.EnvUpdates) > 0 {
		appliedToEnv := false
		if activeEnvID != "" {
			if envPtr, err := fs.GetEnvironment(collRoot, activeEnvID); err == nil && envPtr != nil {
				envPtr.Variables = upsertKVPairs(envPtr.Variables, scriptRes.EnvUpdates)
				if saveRes := envSvc.Save(collRoot, *envPtr); !saveRes.Success && saveRes.Error != nil {
					return fmt.Errorf("%s: %s", saveRes.Error.Code, saveRes.Error.Message)
				}
				appliedToEnv = true
			}
		}
		if !appliedToEnv {
			for k, v := range scriptRes.EnvUpdates {
				collVarsToApply[k] = v
			}
		}
	}

	// 2. Scoped collection variables
	for k, v := range scriptRes.ScopedEnvUpdates.Collection {
		collVarsToApply[k] = v
	}

	// 3. Scoped global environment variables
	for envKey, kvMap := range scriptRes.ScopedEnvUpdates.GlobalEnvs {
		if len(kvMap) == 0 {
			continue
		}
		targetEnvID := resolveEnvID(envKey)
		if targetEnvID == "" {
			continue
		}
		if envPtr, err := fs.GetEnvironment(collRoot, targetEnvID); err == nil && envPtr != nil {
			envPtr.Variables = upsertKVPairs(envPtr.Variables, kvMap)
			if saveRes := envSvc.Save(collRoot, *envPtr); !saveRes.Success && saveRes.Error != nil {
				return fmt.Errorf("%s: %s", saveRes.Error.Code, saveRes.Error.Message)
			}
		}
	}

	// 4. Collection variables + Collection Auth updates
	hasCollAuthGlobal := scriptRes.ScopedAuthUpdates.CollectionGlobal != nil
	hasCollAuthEnvs := len(scriptRes.ScopedAuthUpdates.CollectionEnvs) > 0
	if len(collVarsToApply) > 0 || hasCollAuthGlobal || hasCollAuthEnvs {
		collPath := filepath.Join(collRoot, "collection.json")
		var diskColl model.Collection
		if fs.Exists(collPath) {
			if err := fs.ReadJSON(collPath, &diskColl); err != nil && coll != nil {
				diskColl = *coll
			}
		} else if coll != nil {
			diskColl = *coll
		}
		if diskColl.ID == "" {
			diskColl.ID = filepath.Base(collRoot)
		}
		if len(collVarsToApply) > 0 {
			diskColl.Variables = upsertKVPairs(diskColl.Variables, collVarsToApply)
			collectionChanged = true
		}
		if hasCollAuthGlobal {
			diskColl.Auth = scriptRes.ScopedAuthUpdates.CollectionGlobal
			collectionChanged = true
		}
		if hasCollAuthEnvs {
			if diskColl.AuthEnvs == nil {
				diskColl.AuthEnvs = map[string]*model.AuthConfig{}
			}
			for _, item := range scriptRes.ScopedAuthUpdates.CollectionEnvs {
				targetEnvID := resolveEnvID(item.Env)
				if targetEnvID != "" && item.Auth != nil {
					diskColl.AuthEnvs[targetEnvID] = item.Auth
					collectionChanged = true
				}
			}
		}
		if collectionChanged {
			diskColl.UpdatedAt = time.Now()
			if err := fs.WriteJSON(collPath, diskColl); err != nil {
				return err
			}
			if coll != nil {
				*coll = diskColl
			}
		}
	}

	// 5. Folder variables, Folder-Env variables, Folder Auth, and Folder-Env Auth updates
	type folderMutation struct {
		globals    map[string]string
		envs       map[string]map[string]string
		authGlobal *model.AuthConfig
		authEnvs   map[string]*model.AuthConfig
	}
	folderMuts := map[string]*folderMutation{}
	getFolderMut := func(fID string) *folderMutation {
		if folderMuts[fID] == nil {
			folderMuts[fID] = &folderMutation{
				globals:  map[string]string{},
				envs:     map[string]map[string]string{},
				authEnvs: map[string]*model.AuthConfig{},
			}
		}
		return folderMuts[fID]
	}

	for fSel, kvMap := range scriptRes.ScopedEnvUpdates.FolderGlobals {
		fID := resolveFolderID(fSel)
		if fID == "" {
			continue
		}
		fm := getFolderMut(fID)
		for k, v := range kvMap {
			fm.globals[k] = v
		}
	}

	for _, item := range scriptRes.ScopedEnvUpdates.FolderEnvs {
		fID := resolveFolderID(item.Folder)
		targetEnvID := resolveEnvID(item.Env)
		if fID == "" || targetEnvID == "" {
			continue
		}
		fm := getFolderMut(fID)
		if fm.envs[targetEnvID] == nil {
			fm.envs[targetEnvID] = map[string]string{}
		}
		fm.envs[targetEnvID][item.Key] = item.Value
	}

	for fSel, authCfg := range scriptRes.ScopedAuthUpdates.FolderGlobals {
		if authCfg == nil {
			continue
		}
		fID := resolveFolderID(fSel)
		if fID == "" {
			continue
		}
		fm := getFolderMut(fID)
		fm.authGlobal = authCfg
	}

	for _, item := range scriptRes.ScopedAuthUpdates.FolderEnvs {
		if item.Auth == nil {
			continue
		}
		fID := resolveFolderID(item.Folder)
		targetEnvID := resolveEnvID(item.Env)
		if fID == "" || targetEnvID == "" {
			continue
		}
		fm := getFolderMut(fID)
		fm.authEnvs[targetEnvID] = item.Auth
	}

	for folderID, mut := range folderMuts {
		loadRes := collSvc.LoadFolder(folderID)
		if !loadRes.Success {
			continue
		}
		folder, ok := loadRes.Data.(model.Folder)
		if !ok {
			continue
		}
		if len(mut.globals) > 0 {
			folder.Variables = upsertKVPairs(folder.Variables, mut.globals)
		}
		if len(mut.envs) > 0 {
			if folder.FolderEnvs == nil {
				folder.FolderEnvs = map[string][]model.KVPair{}
			}
			for envID, kvMap := range mut.envs {
				folder.FolderEnvs[envID] = upsertKVPairs(folder.FolderEnvs[envID], kvMap)
			}
		}
		if mut.authGlobal != nil {
			folder.Auth = mut.authGlobal
		}
		if len(mut.authEnvs) > 0 {
			if folder.AuthEnvs == nil {
				folder.AuthEnvs = map[string]*model.AuthConfig{}
			}
			for envID, authCfg := range mut.authEnvs {
				folder.AuthEnvs[envID] = authCfg
			}
		}
		if updRes := collSvc.UpdateFolder(folder); !updRes.Success && updRes.Error != nil {
			return fmt.Errorf("%s: %s", updRes.Error.Code, updRes.Error.Message)
		}
	}

	return nil
}

// ExecuteRequestFlow orchestrates the full request execution lifecycle using the embedded
// headless-engine.js on goja and ExecutorService.Send:
// 1. Pre-request script + variable/auth hierarchy resolution + URL/Param sync + JSONC stripping
// 2. Persisting Pre-request variable/auth updates to disk (unless NoSaveEnv is true)
// 3. HTTP request execution via ExecutorService.Send
// 4. Post-response script execution + persisting Post-response variable/auth updates to disk
// 5. Recording execution history via HistoryService.RecordExecution
func ExecuteRequestFlow(opts RunOptions) (*RunOutput, error) {
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
	execSvc := opts.ExecutorSvc
	if execSvc == nil {
		execSvc = service.NewExecutorService(silentLogger)
	}
	historySvc := opts.HistorySvc
	if historySvc == nil {
		historySvc = service.NewHistoryService(fs, silentLogger)
	}

	// Ensure Collection metadata is loaded if CollectionRoot is provided
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

	// Ensure Environments are loaded if nil and CollectionRoot is provided
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

	pathFolders := opts.PathFolders
	allFolders := opts.AllFolders
	if pathFolders == nil && allFolders == nil && opts.CollectionRoot != "" && opts.Request.ID != "" {
		if _, pf, af, err := collSvc.ResolveRequestSelector(opts.CollectionRoot, opts.Request.ID); err == nil {
			pathFolders = pf
			allFolders = af
		}
	}
	if pathFolders == nil {
		pathFolders = []model.TreeNode{}
	}
	if allFolders == nil {
		allFolders = pathFolders
	}

	vm, _, err := newHeadlessRuntime()
	if err != nil {
		return nil, err
	}

	var activeEnvPtr *string
	if activeEnvID != "" {
		activeEnvPtr = &activeEnvID
	}

	preIn := headlessPreInput{
		Request:         opts.Request,
		Collection:      coll,
		Environments:    envs,
		ActiveEnvID:     activeEnvPtr,
		PathFolders:     pathFolders,
		AllFolders:      allFolders,
		CLIVarOverrides: opts.CLIVarOverrides,
	}

	var preOut headlessPreOutput
	if err := callEngineJSON(vm, "prepareHeadlessExecution", preIn, &preOut); err != nil {
		return nil, err
	}

	allLogs := []string{}
	allTests := []ScriptTestResult{}
	var scriptErrors []string
	mergedEnvUpdates := map[string]string{}
	var mergedScopedEnv *ScopedEnvUpdates
	var mergedScopedAuth *ScopedAuthUpdates

	if preOut.PreScriptResult != nil {
		for _, l := range preOut.PreScriptResult.Logs {
			allLogs = append(allLogs, fmt.Sprintf("[Pre-request] %s", l))
		}
		if len(preOut.PreScriptResult.TestResults) > 0 {
			allTests = append(allTests, preOut.PreScriptResult.TestResults...)
		}
		for k, v := range preOut.PreScriptResult.EnvUpdates {
			mergedEnvUpdates[k] = v
		}
		mergedScopedEnv = mergeScopedEnvUpdates(mergedScopedEnv, &preOut.PreScriptResult.ScopedEnvUpdates)
		mergedScopedAuth = mergeScopedAuthUpdates(mergedScopedAuth, &preOut.PreScriptResult.ScopedAuthUpdates)
		if !preOut.PreScriptResult.Success && preOut.PreScriptResult.Error != "" {
			scriptErrors = append(scriptErrors, preOut.PreScriptResult.Error)
		}

		if !opts.NoSaveEnv && opts.CollectionRoot != "" {
			if err := ApplyScriptUpdatesToDisk(
				fs,
				collSvc,
				envSvc,
				opts.CollectionsRoot,
				opts.CollectionRoot,
				&coll,
				activeEnvID,
				preOut.MutatedPathFolders,
				preOut.MutatedAllFolders,
				preOut.PreScriptResult,
			); err != nil {
				scriptErrors = append(scriptErrors, err.Error())
			}
		}
	}

	if opts.TimeoutMs > 0 {
		preOut.ExecuteRequest.TimeoutMs = opts.TimeoutMs
	} else if opts.TimeoutSec > 0 {
		execSvc.SetTimeout(time.Duration(opts.TimeoutSec) * time.Second)
		if preOut.ExecuteRequest.TimeoutMs <= 0 {
			preOut.ExecuteRequest.TimeoutMs = opts.TimeoutSec * 1000
		}
	}

	sendRes := execSvc.Send(preOut.ExecuteRequest)
	if !sendRes.Success {
		errCode := model.ErrConnection
		errMsg := "request execution failed"
		if sendRes.Error != nil {
			errCode = sendRes.Error.Code
			errMsg = sendRes.Error.Message
		}
		if opts.CollectionRoot != "" {
			reqName := opts.Request.Name
			if strings.TrimSpace(reqName) == "" {
				reqName = preOut.ExecuteRequest.URL
			}
			historySvc.RecordExecution(opts.CollectionRoot, model.ExecutionHistoryEntry{
				CollectionID: coll.ID,
				RequestID:    opts.Request.ID,
				RequestName:  reqName,
				Method:       preOut.ExecuteRequest.Method,
				URL:          preOut.ExecuteRequest.URL,
				Timestamp:    time.Now().UTC().Format(time.RFC3339),
				Request:      preOut.ExecuteRequest,
				Error:        fmt.Sprintf("[%s] %s", errCode, errMsg),
			})
		}
		var envUpdatesOut map[string]string
		if len(mergedEnvUpdates) > 0 {
			envUpdatesOut = mergedEnvUpdates
		}
		return &RunOutput{
			Request:           preOut.ExecuteRequest,
			ResolvedRequest:   preOut.ExecuteRequest,
			ScriptTests:       allTests,
			ScriptLogs:        allLogs,
			ConsoleLogs:       allLogs,
			EnvUpdates:        envUpdatesOut,
			ScopedEnvUpdates:  mergedScopedEnv,
			ScopedAuthUpdates: mergedScopedAuth,
			ScriptError:       strings.Join(scriptErrors, "; "),
			NetworkError:      fmt.Sprintf("%s: %s", errCode, errMsg),
		}, fmt.Errorf("%s: %s", errCode, errMsg)
	}

	resp, ok := sendRes.Data.(model.ExecuteResponse)
	if !ok {
		return nil, fmt.Errorf("%s: invalid response payload", model.ErrIO)
	}

	// Step 4: Post-response script execution
	if preOut.EffectiveRequest.Scripts != nil && strings.TrimSpace(preOut.EffectiveRequest.Scripts.PostResponse) != "" {
		postIn := headlessPostInput{
			EffectiveRequest:  preOut.EffectiveRequest,
			Response:          resp,
			ResolvedVariables: preOut.ResolvedVariables,
			Collection:        preOut.MutatedCollection,
			Environments:      preOut.MutatedEnvironments,
			ActiveEnvID:       activeEnvPtr,
			PathFolders:       preOut.MutatedPathFolders,
			AllFolders:        preOut.MutatedAllFolders,
			CLIVarOverrides:   opts.CLIVarOverrides,
		}
		var postRes ScriptExecutionResult
		if err := callEngineJSON(vm, "runHeadlessPostResponse", postIn, &postRes); err != nil {
			scriptErrors = append(scriptErrors, err.Error())
		} else {
			for _, l := range postRes.Logs {
				allLogs = append(allLogs, fmt.Sprintf("[Post-response] %s", l))
			}
			if len(postRes.TestResults) > 0 {
				allTests = append(allTests, postRes.TestResults...)
			}
			for k, v := range postRes.EnvUpdates {
				mergedEnvUpdates[k] = v
			}
			mergedScopedEnv = mergeScopedEnvUpdates(mergedScopedEnv, &postRes.ScopedEnvUpdates)
			mergedScopedAuth = mergeScopedAuthUpdates(mergedScopedAuth, &postRes.ScopedAuthUpdates)
			if !postRes.Success && postRes.Error != "" {
				scriptErrors = append(scriptErrors, postRes.Error)
			}

			if !opts.NoSaveEnv && opts.CollectionRoot != "" {
				if err := ApplyScriptUpdatesToDisk(
					fs,
					collSvc,
					envSvc,
					opts.CollectionsRoot,
					opts.CollectionRoot,
					&coll,
					activeEnvID,
					preOut.MutatedPathFolders,
					preOut.MutatedAllFolders,
					&postRes,
				); err != nil {
					scriptErrors = append(scriptErrors, err.Error())
				}
			}
		}
	}

	// Step 5: Record Execution History
	if opts.CollectionRoot != "" {
		reqName := opts.Request.Name
		if strings.TrimSpace(reqName) == "" {
			reqName = preOut.ExecuteRequest.URL
		}
		historySvc.RecordExecution(opts.CollectionRoot, model.ExecutionHistoryEntry{
			CollectionID: coll.ID,
			RequestID:    opts.Request.ID,
			RequestName:  reqName,
			Method:       preOut.ExecuteRequest.Method,
			URL:          preOut.ExecuteRequest.URL,
			StatusCode:   resp.StatusCode,
			StatusText:   resp.StatusText,
			TimeMs:       int64(resp.TimeMs),
			SizeBytes:    int64(resp.SizeBytes),
			Timestamp:    resp.Timestamp,
			Request:      preOut.ExecuteRequest,
			Response:     &resp,
		})
	}

	var envUpdatesOut map[string]string
	if len(mergedEnvUpdates) > 0 {
		envUpdatesOut = mergedEnvUpdates
	}

	return &RunOutput{
		StatusCode:        resp.StatusCode,
		StatusText:        resp.StatusText,
		TimeMs:            int64(resp.TimeMs),
		SizeBytes:         int64(resp.SizeBytes),
		Headers:           resp.Headers,
		Body:              resp.Body,
		Request:           preOut.ExecuteRequest,
		ResolvedRequest:   preOut.ExecuteRequest,
		Response:          &resp,
		ScriptTests:       allTests,
		ScriptLogs:        allLogs,
		ConsoleLogs:       allLogs,
		EnvUpdates:        envUpdatesOut,
		ScopedEnvUpdates:  mergedScopedEnv,
		ScopedAuthUpdates: mergedScopedAuth,
		ScriptError:       strings.Join(scriptErrors, "; "),
	}, nil
}
