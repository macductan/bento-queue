package service

import (
	"fmt"
	"io"
	"log/slog"
	"path/filepath"
	"sort"
	"strings"

	"hecto-api/model"
	"hecto-api/storage"
)

// ResolveCollectionSelector resolves a collection by ID or case-insensitive Name.
// If selector is empty, activeCollection is used.
// Immediately calls fs.SetCollectionRoot(collRoot) once resolved.
func (s *CollectionService) ResolveCollectionSelector(collectionsRoot, activeCollection, selector string) (model.Collection, string, error) {
	collectionsRoot = strings.TrimSpace(collectionsRoot)
	if collectionsRoot == "" {
		return model.Collection{}, "", fmt.Errorf("%s: %s", model.ErrValidation, ErrCollectionRootEmpty)
	}

	activeTrimmed := strings.TrimSpace(activeCollection)
	sel := strings.TrimSpace(selector)
	if sel == "" {
		sel = activeTrimmed
	}
	if sel == "" {
		return model.Collection{}, "", fmt.Errorf("%s: %s", model.ErrValidation, ErrCollectionIDEmpty)
	}

	res := s.ListCollections(collectionsRoot, activeTrimmed)
	colls, _ := res.Data.([]model.Collection)

	// 1. Exact ID match
	for _, c := range colls {
		if c.ID == sel {
			collRoot := filepath.Join(collectionsRoot, c.ID)
			s.fs.SetCollectionRoot(collRoot)
			return c, collRoot, nil
		}
	}

	// 2. Case-insensitive Name match
	var matches []model.Collection
	for _, c := range colls {
		if strings.EqualFold(strings.TrimSpace(c.Name), sel) {
			matches = append(matches, c)
		}
	}

	if len(matches) == 1 {
		collRoot := filepath.Join(collectionsRoot, matches[0].ID)
		s.fs.SetCollectionRoot(collRoot)
		return matches[0], collRoot, nil
	}

	if len(matches) > 1 {
		ids := make([]string, 0, len(matches))
		for _, m := range matches {
			ids = append(ids, m.ID)
		}
		return model.Collection{}, "", fmt.Errorf(
			"%s: có nhiều collection trùng tên %q (IDs: %s), vui lòng chỉ định ID cụ thể",
			model.ErrValidation, sel, strings.Join(ids, ", "),
		)
	}

	return model.Collection{}, "", fmt.Errorf("%s: không tìm thấy collection %q", model.ErrNotFound, sel)
}

// ResolveEnvironmentSelector resolves an environment in collRoot by UUID or case-insensitive Name.
func (s *CollectionService) ResolveEnvironmentSelector(collRoot, selector string) (*model.Environment, error) {
	collRoot = strings.TrimSpace(collRoot)
	if collRoot == "" {
		return nil, fmt.Errorf("%s: %s", model.ErrValidation, ErrCollectionRootEmpty)
	}

	sel := strings.TrimSpace(selector)
	if sel == "" {
		return nil, fmt.Errorf("%s: tên hoặc ID environment không được để trống", model.ErrValidation)
	}

	s.fs.SetCollectionRoot(collRoot)

	envs, err := s.fs.ListEnvironments(collRoot)
	if err != nil {
		return nil, err
	}

	normalizeEnv := func(env model.Environment) *model.Environment {
		envCopy := env
		if envCopy.Variables == nil {
			envCopy.Variables = []model.KVPair{}
		}
		return &envCopy
	}

	// 1. Exact ID match
	for i := range envs {
		if envs[i].ID == sel {
			return normalizeEnv(envs[i]), nil
		}
	}

	// 2. Case-insensitive Name match
	var matches []model.Environment
	for i := range envs {
		if strings.EqualFold(strings.TrimSpace(envs[i].Name), sel) {
			matches = append(matches, envs[i])
		}
	}

	if len(matches) == 1 {
		return normalizeEnv(matches[0]), nil
	}

	if len(matches) > 1 {
		ids := make([]string, 0, len(matches))
		for _, m := range matches {
			ids = append(ids, m.ID)
		}
		return nil, fmt.Errorf(
			"%s: có nhiều environment trùng tên %q (IDs: %s), vui lòng chỉ định UUID cụ thể",
			model.ErrValidation, sel, strings.Join(ids, ", "),
		)
	}

	return nil, fmt.Errorf("%s: không tìm thấy environment %q", model.ErrNotFound, sel)
}

// ResolveFolderSelector resolves a folder by UUID or slash-separated hierarchical path.
// Returns the target folder TreeNode and its ancestor folder TreeNodes (from root down to parent).
func (s *CollectionService) ResolveFolderSelector(collRoot, selector string) (model.TreeNode, []model.TreeNode, error) {
	collRoot = strings.TrimSpace(collRoot)
	if collRoot == "" {
		return model.TreeNode{}, nil, fmt.Errorf("%s: %s", model.ErrValidation, ErrCollectionRootEmpty)
	}

	sel := strings.TrimSpace(selector)
	if sel == "" {
		return model.TreeNode{}, nil, fmt.Errorf("%s: %s", model.ErrValidation, ErrFolderNameEmpty)
	}

	treeRes := s.GetTree(collRoot)
	if !treeRes.Success {
		if treeRes.Error != nil {
			return model.TreeNode{}, nil, fmt.Errorf("%s: %s", treeRes.Error.Code, treeRes.Error.Message)
		}
		return model.TreeNode{}, nil, fmt.Errorf("%s: %s", model.ErrIO, ErrFolderReadFailed)
	}

	tree, _ := treeRes.Data.([]model.TreeNode)

	// 1. Exact UUID match anywhere in the tree
	if found, ancestors, ok := findFolderByIDInTree(tree, sel, []model.TreeNode{}); ok {
		return found, ancestors, nil
	}

	parts := splitSelectorSegments(sel)
	if len(parts) == 0 {
		return model.TreeNode{}, nil, fmt.Errorf("%s: %s", model.ErrValidation, ErrFolderNameEmpty)
	}

	candidates, err := findFolderCandidatesBySegments(tree, parts, []model.TreeNode{})
	if err != nil {
		return model.TreeNode{}, nil, err
	}
	if len(candidates) == 0 {
		return model.TreeNode{}, nil, fmt.Errorf("%s: không tìm thấy thư mục %q", model.ErrNotFound, sel)
	}
	if len(candidates) > 1 {
		ids := make([]string, 0, len(candidates))
		for _, c := range candidates {
			ids = append(ids, c.node.ID)
		}
		return model.TreeNode{}, nil, fmt.Errorf(
			"%s: có nhiều thư mục trùng tên/đường dẫn %q (IDs: %s), vui lòng chỉ định UUID cụ thể",
			model.ErrValidation, sel, strings.Join(ids, ", "),
		)
	}

	return candidates[0].node, candidates[0].ancestors, nil
}

// ResolveRequestSelector resolves a request by UUID, direct name, or slash-separated folder/request path.
// Reads the full model.Request from disk via ReadJSON and returns (request, pathFolders, allFolders, err).
func (s *CollectionService) ResolveRequestSelector(collRoot, selector string) (model.Request, []model.TreeNode, []model.TreeNode, error) {
	collRoot = strings.TrimSpace(collRoot)
	if collRoot == "" {
		return model.Request{}, nil, nil, fmt.Errorf("%s: %s", model.ErrValidation, ErrCollectionRootEmpty)
	}

	sel := strings.TrimSpace(selector)
	if sel == "" {
		return model.Request{}, nil, nil, fmt.Errorf("%s: %s", model.ErrValidation, ErrRequestNameEmpty)
	}

	treeRes := s.GetTree(collRoot)
	if !treeRes.Success {
		if treeRes.Error != nil {
			return model.Request{}, nil, nil, fmt.Errorf("%s: %s", treeRes.Error.Code, treeRes.Error.Message)
		}
		return model.Request{}, nil, nil, fmt.Errorf("%s: %s", model.ErrIO, ErrRequestReadFailed)
	}

	tree, _ := treeRes.Data.([]model.TreeNode)
	allFolders := collectAllFolders(tree)

	// 1. Exact UUID match anywhere in the tree
	if reqNode, pathFolders, ok := findRequestByIDInTree(tree, sel, []model.TreeNode{}); ok {
		req, err := s.readFullRequestNode(reqNode)
		if err != nil {
			return model.Request{}, nil, nil, err
		}
		return req, pathFolders, allFolders, nil
	}

	parts := splitSelectorSegments(sel)
	if len(parts) == 0 {
		return model.Request{}, nil, nil, fmt.Errorf("%s: %s", model.ErrValidation, ErrRequestNameEmpty)
	}

	candidates, err := findRequestCandidatesBySegments(tree, parts, []model.TreeNode{})
	if err != nil {
		return model.Request{}, nil, nil, err
	}
	if len(candidates) == 0 {
		return model.Request{}, nil, nil, fmt.Errorf("%s: không tìm thấy request %q", model.ErrNotFound, sel)
	}
	if len(candidates) > 1 {
		nodes := make([]model.TreeNode, 0, len(candidates))
		for _, c := range candidates {
			nodes = append(nodes, c.node)
		}
		return model.Request{}, nil, nil, duplicateRequestsValidationError(sel, nodes)
	}

	req, err := s.readFullRequestNode(candidates[0].node)
	if err != nil {
		return model.Request{}, nil, nil, err
	}

	return req, candidates[0].ancestors, allFolders, nil
}

type resolvedNodeCandidate struct {
	node      model.TreeNode
	ancestors []model.TreeNode
}

func (s *CollectionService) readFullRequestNode(node model.TreeNode) (model.Request, error) {
	var req model.Request
	if err := s.fs.ReadJSON(node.Path, &req); err != nil {
		return model.Request{}, err
	}
	if req.Auth == nil {
		req.Auth = &model.AuthConfig{Type: "inherit"}
	}
	if req.Headers == nil {
		req.Headers = []model.KVPair{}
	}
	if req.Params == nil {
		req.Params = []model.KVPair{}
	}
	return req, nil
}

func findFolderByIDInTree(nodes []model.TreeNode, id string, ancestors []model.TreeNode) (model.TreeNode, []model.TreeNode, bool) {
	for _, node := range nodes {
		if node.Type != "folder" {
			continue
		}
		if node.ID == id {
			return node, ancestors, true
		}
		nextAncestors := append(append([]model.TreeNode{}, ancestors...), node)
		if found, foundAncestors, ok := findFolderByIDInTree(node.Children, id, nextAncestors); ok {
			return found, foundAncestors, true
		}
	}
	return model.TreeNode{}, nil, false
}

func findRequestByIDInTree(nodes []model.TreeNode, id string, ancestors []model.TreeNode) (model.TreeNode, []model.TreeNode, bool) {
	for _, node := range nodes {
		if node.Type == "request" && node.ID == id {
			return node, ancestors, true
		}
		if node.Type == "folder" {
			nextAncestors := append(append([]model.TreeNode{}, ancestors...), node)
			if found, foundAncestors, ok := findRequestByIDInTree(node.Children, id, nextAncestors); ok {
				return found, foundAncestors, true
			}
		}
	}
	return model.TreeNode{}, nil, false
}

func collectAllFolders(nodes []model.TreeNode) []model.TreeNode {
	result := []model.TreeNode{}
	for _, node := range nodes {
		if node.Type == "folder" {
			result = append(result, node)
			if len(node.Children) > 0 {
				result = append(result, collectAllFolders(node.Children)...)
			}
		}
	}
	return result
}

func splitSelectorSegments(selector string) []string {
	rawParts := strings.Split(selector, "/")
	parts := make([]string, 0, len(rawParts))
	for _, p := range rawParts {
		trimmed := strings.TrimSpace(p)
		if trimmed != "" {
			parts = append(parts, trimmed)
		}
	}
	return parts
}

func segmentsEqualFold(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if !strings.EqualFold(strings.TrimSpace(a[i]), strings.TrimSpace(b[i])) {
			return false
		}
	}
	return true
}

// matchedPrefixLen checks if node matches a prefix of parts (by exact ID on parts[0], or by node.Name segments).
// Returns the number of segments consumed (0 if no match), and whether it was an exact ID match.
func matchedPrefixLen(node model.TreeNode, parts []string) (int, bool) {
	if len(parts) == 0 {
		return 0, false
	}
	if node.ID == parts[0] {
		return 1, true
	}
	nameParts := splitSelectorSegments(node.Name)
	if len(nameParts) > 0 && len(parts) >= len(nameParts) && segmentsEqualFold(parts[:len(nameParts)], nameParts) {
		return len(nameParts), false
	}
	return 0, false
}

func findFolderCandidatesBySegments(nodes []model.TreeNode, parts []string, ancestors []model.TreeNode) ([]resolvedNodeCandidate, error) {
	type folderPrefixMatch struct {
		node  model.TreeNode
		k     int
		byID  bool
		label string
	}

	var prefixMatches []folderPrefixMatch
	for _, node := range nodes {
		if node.Type != "folder" {
			continue
		}
		if k, byID := matchedPrefixLen(node, parts); k > 0 {
			prefixMatches = append(prefixMatches, folderPrefixMatch{
				node:  node,
				k:     k,
				byID:  byID,
				label: strings.Join(parts[:k], "/"),
			})
		}
	}

	// Group by consumed segment length k to detect duplicate folder names at the same level
	byLen := make(map[int][]folderPrefixMatch)
	for _, m := range prefixMatches {
		byLen[m.k] = append(byLen[m.k], m)
	}

	lengths := make([]int, 0, len(byLen))
	for k := range byLen {
		lengths = append(lengths, k)
	}
	sort.Ints(lengths)

	var results []resolvedNodeCandidate
	for _, k := range lengths {
		group := byLen[k]
		// If an exact ID match exists in this group, prefer it
		var effectiveGroup []folderPrefixMatch
		for _, m := range group {
			if m.byID {
				effectiveGroup = append(effectiveGroup, m)
			}
		}
		if len(effectiveGroup) == 0 {
			effectiveGroup = group
		}

		if len(effectiveGroup) > 1 {
			ids := make([]string, 0, len(effectiveGroup))
			for _, m := range effectiveGroup {
				ids = append(ids, m.node.ID)
			}
			return nil, fmt.Errorf(
				"%s: có nhiều thư mục trùng tên %q (IDs: %s), vui lòng chỉ định UUID cụ thể",
				model.ErrValidation, effectiveGroup[0].label, strings.Join(ids, ", "),
			)
		}

		matched := effectiveGroup[0].node
		if k == len(parts) {
			results = append(results, resolvedNodeCandidate{node: matched, ancestors: ancestors})
		} else {
			nextAncestors := append(append([]model.TreeNode{}, ancestors...), matched)
			sub, err := findFolderCandidatesBySegments(matched.Children, parts[k:], nextAncestors)
			if err != nil {
				return nil, err
			}
			results = append(results, sub...)
		}
	}

	return results, nil
}

func findRequestCandidatesBySegments(nodes []model.TreeNode, parts []string, ancestors []model.TreeNode) ([]resolvedNodeCandidate, error) {
	var results []resolvedNodeCandidate

	// 1. Check requests at the current level that consume all remaining parts
	var idMatches []resolvedNodeCandidate
	var nameMatches []resolvedNodeCandidate
	for _, node := range nodes {
		if node.Type != "request" {
			continue
		}
		if k, byID := matchedPrefixLen(node, parts); k == len(parts) {
			cand := resolvedNodeCandidate{node: node, ancestors: ancestors}
			if byID {
				idMatches = append(idMatches, cand)
			} else {
				nameMatches = append(nameMatches, cand)
			}
		}
	}
	if len(idMatches) > 0 {
		results = append(results, idMatches...)
	} else if len(nameMatches) > 1 {
		reqNodes := make([]model.TreeNode, 0, len(nameMatches))
		for _, m := range nameMatches {
			reqNodes = append(reqNodes, m.node)
		}
		return nil, duplicateRequestsValidationError(strings.Join(parts, "/"), reqNodes)
	} else if len(nameMatches) == 1 {
		results = append(results, nameMatches[0])
	}

	// 2. Check folders at the current level that consume a strict prefix of parts (k < len(parts))
	type folderPrefixMatch struct {
		node  model.TreeNode
		k     int
		byID  bool
		label string
	}
	byLen := make(map[int][]folderPrefixMatch)
	for _, node := range nodes {
		if node.Type != "folder" {
			continue
		}
		if k, byID := matchedPrefixLen(node, parts); k > 0 && k < len(parts) {
			byLen[k] = append(byLen[k], folderPrefixMatch{
				node:  node,
				k:     k,
				byID:  byID,
				label: strings.Join(parts[:k], "/"),
			})
		}
	}

	lengths := make([]int, 0, len(byLen))
	for k := range byLen {
		lengths = append(lengths, k)
	}
	sort.Ints(lengths)

	for _, k := range lengths {
		group := byLen[k]
		var effectiveGroup []folderPrefixMatch
		for _, m := range group {
			if m.byID {
				effectiveGroup = append(effectiveGroup, m)
			}
		}
		if len(effectiveGroup) == 0 {
			effectiveGroup = group
		}

		if len(effectiveGroup) > 1 {
			ids := make([]string, 0, len(effectiveGroup))
			for _, m := range effectiveGroup {
				ids = append(ids, m.node.ID)
			}
			return nil, fmt.Errorf(
				"%s: có nhiều thư mục trùng tên %q (IDs: %s), vui lòng chỉ định UUID cụ thể",
				model.ErrValidation, effectiveGroup[0].label, strings.Join(ids, ", "),
			)
		}

		matched := effectiveGroup[0].node
		nextAncestors := append(append([]model.TreeNode{}, ancestors...), matched)
		sub, err := findRequestCandidatesBySegments(matched.Children, parts[k:], nextAncestors)
		if err != nil {
			return nil, err
		}
		results = append(results, sub...)
	}

	return results, nil
}

func duplicateRequestsValidationError(name string, matches []model.TreeNode) error {
	items := make([]string, 0, len(matches))
	for _, m := range matches {
		method := m.Method
		if method == "" {
			method = "GET"
		}
		items = append(items, fmt.Sprintf("%s [%s]", m.ID, method))
	}
	return fmt.Errorf(
		"%s: có nhiều request trùng tên %q trong cùng thư mục (IDs: %s), vui lòng chỉ định UUID cụ thể",
		model.ErrValidation, name, strings.Join(items, ", "),
	)
}

// Package-level helpers delegating to a temporary CollectionService bound to fs.

// ResolveCollectionSelector resolves a collection by ID or Name using the given FileSystem.
func ResolveCollectionSelector(fs *storage.FileSystem, collectionsRoot, activeCollection, selector string) (model.Collection, string, error) {
	svc := NewCollectionService(fs, silentLogger())
	return svc.ResolveCollectionSelector(collectionsRoot, activeCollection, selector)
}

// ResolveEnvironmentSelector resolves an environment by ID or Name using the given FileSystem.
func ResolveEnvironmentSelector(fs *storage.FileSystem, collRoot, selector string) (*model.Environment, error) {
	svc := NewCollectionService(fs, silentLogger())
	return svc.ResolveEnvironmentSelector(collRoot, selector)
}

// ResolveFolderSelector resolves a folder by ID or hierarchical path using the given FileSystem.
func ResolveFolderSelector(fs *storage.FileSystem, collRoot, selector string) (model.TreeNode, []model.TreeNode, error) {
	svc := NewCollectionService(fs, silentLogger())
	return svc.ResolveFolderSelector(collRoot, selector)
}

// ResolveRequestSelector resolves a request by ID or hierarchical path using the given FileSystem.
func ResolveRequestSelector(fs *storage.FileSystem, collRoot, selector string) (model.Request, []model.TreeNode, []model.TreeNode, error) {
	svc := NewCollectionService(fs, silentLogger())
	return svc.ResolveRequestSelector(collRoot, selector)
}

// ResolveFlowFolderSelector resolves a FlowFolder by UUID or slash-separated hierarchical path inside <collection>/flows/.
// Returns the target FlowTreeNode (type: "flow_folder") and its ancestor FlowTreeNodes (from root down to parent).
func (s *FlowService) ResolveFlowFolderSelector(collRoot, selector string) (model.FlowTreeNode, []model.FlowTreeNode, error) {
	collRoot = strings.TrimSpace(collRoot)
	if collRoot == "" {
		return model.FlowTreeNode{}, nil, fmt.Errorf("%s: %s", model.ErrValidation, ErrCollectionRootEmpty)
	}

	sel := strings.TrimSpace(selector)
	if sel == "" {
		return model.FlowTreeNode{}, nil, fmt.Errorf("%s: %s", model.ErrValidation, ErrFlowFolderNameEmpty)
	}

	treeRes := s.GetTree(collRoot)
	if !treeRes.Success {
		if treeRes.Error != nil {
			return model.FlowTreeNode{}, nil, fmt.Errorf("%s: %s", treeRes.Error.Code, treeRes.Error.Message)
		}
		return model.FlowTreeNode{}, nil, fmt.Errorf("%s: %s", model.ErrIO, ErrFlowFolderReadFailed)
	}

	tree, _ := treeRes.Data.([]model.FlowTreeNode)

	// 1. Exact UUID match anywhere in the flow tree
	if found, ancestors, ok := findFlowFolderByIDInTree(tree, sel, []model.FlowTreeNode{}); ok {
		return found, ancestors, nil
	}

	// 1b. Unambiguous UUID prefix match (>= 6 chars)
	if len(sel) >= 6 && isUUIDPrefixCandidate(sel) {
		prefixMatches := findFlowFoldersByIDPrefixInTree(tree, sel, []model.FlowTreeNode{})
		if len(prefixMatches) == 1 {
			return prefixMatches[0].node, prefixMatches[0].ancestors, nil
		}
		if len(prefixMatches) > 1 {
			ids := make([]string, 0, len(prefixMatches))
			for _, c := range prefixMatches {
				ids = append(ids, c.node.ID)
			}
			return model.FlowTreeNode{}, nil, fmt.Errorf(
				"%s: có nhiều thư mục flow khớp tiền tố ID %q (IDs: %s), vui lòng chỉ định UUID cụ thể",
				model.ErrValidation, sel, strings.Join(ids, ", "),
			)
		}
	}

	parts := splitSelectorSegments(sel)
	if len(parts) == 0 {
		return model.FlowTreeNode{}, nil, fmt.Errorf("%s: %s", model.ErrValidation, ErrFlowFolderNameEmpty)
	}

	candidates, err := findFlowFolderCandidatesBySegments(tree, parts, []model.FlowTreeNode{})
	if err != nil {
		return model.FlowTreeNode{}, nil, err
	}
	if len(candidates) == 0 && len(parts) == 1 && len(sel) >= 6 {
		candidates = findFlowFoldersByIDPrefixInTree(tree, sel, []model.FlowTreeNode{})
	}
	if len(candidates) == 0 {
		return model.FlowTreeNode{}, nil, fmt.Errorf("%s: không tìm thấy thư mục flow %q", model.ErrNotFound, sel)
	}
	if len(candidates) > 1 {
		ids := make([]string, 0, len(candidates))
		for _, c := range candidates {
			ids = append(ids, c.node.ID)
		}
		return model.FlowTreeNode{}, nil, fmt.Errorf(
			"%s: có nhiều thư mục flow trùng tên/đường dẫn %q (IDs: %s), vui lòng chỉ định UUID cụ thể",
			model.ErrValidation, sel, strings.Join(ids, ", "),
		)
	}

	return candidates[0].node, candidates[0].ancestors, nil
}

// ResolveFlowSelector resolves a Flow by UUID, unambiguous UUID prefix (>= 6 chars), direct name, or slash-separated folder/flow path inside <collection>/flows/.
// Reads the full model.Flow from disk and returns (flow, ancestors, err).
func (s *FlowService) ResolveFlowSelector(collRoot, selector string) (model.Flow, []model.FlowTreeNode, error) {
	collRoot = strings.TrimSpace(collRoot)
	if collRoot == "" {
		return model.Flow{}, nil, fmt.Errorf("%s: %s", model.ErrValidation, ErrCollectionRootEmpty)
	}

	sel := strings.TrimSpace(selector)
	if sel == "" {
		return model.Flow{}, nil, fmt.Errorf("%s: %s", model.ErrValidation, ErrFlowNameEmpty)
	}

	treeRes := s.GetTree(collRoot)
	if !treeRes.Success {
		if treeRes.Error != nil {
			return model.Flow{}, nil, fmt.Errorf("%s: %s", treeRes.Error.Code, treeRes.Error.Message)
		}
		return model.Flow{}, nil, fmt.Errorf("%s: %s", model.ErrIO, ErrFlowReadFailed)
	}

	tree, _ := treeRes.Data.([]model.FlowTreeNode)

	// 1. Exact UUID match anywhere in the flow tree
	if flowNode, ancestors, ok := findFlowByIDInTree(tree, sel, []model.FlowTreeNode{}); ok {
		flow, err := s.readFullFlowNode(flowNode)
		if err != nil {
			return model.Flow{}, nil, err
		}
		return flow, ancestors, nil
	}

	// 1b. Unambiguous UUID prefix match (>= 6 chars)
	if len(sel) >= 6 && isUUIDPrefixCandidate(sel) {
		prefixMatches := findFlowsByIDPrefixInTree(tree, sel, []model.FlowTreeNode{})
		if len(prefixMatches) == 1 {
			flow, err := s.readFullFlowNode(prefixMatches[0].node)
			if err != nil {
				return model.Flow{}, nil, err
			}
			return flow, prefixMatches[0].ancestors, nil
		}
		if len(prefixMatches) > 1 {
			nodes := make([]model.FlowTreeNode, 0, len(prefixMatches))
			for _, c := range prefixMatches {
				nodes = append(nodes, c.node)
			}
			return model.Flow{}, nil, duplicateFlowsValidationError(sel, nodes)
		}
	}

	parts := splitSelectorSegments(sel)
	if len(parts) == 0 {
		return model.Flow{}, nil, fmt.Errorf("%s: %s", model.ErrValidation, ErrFlowNameEmpty)
	}

	candidates, err := findFlowCandidatesBySegments(tree, parts, []model.FlowTreeNode{})
	if err != nil {
		return model.Flow{}, nil, err
	}
	if len(candidates) == 0 && len(parts) == 1 && len(sel) >= 6 {
		candidates = findFlowsByIDPrefixInTree(tree, sel, []model.FlowTreeNode{})
	}
	if len(candidates) == 0 {
		return model.Flow{}, nil, fmt.Errorf("%s: không tìm thấy flow %q", model.ErrNotFound, sel)
	}
	if len(candidates) > 1 {
		nodes := make([]model.FlowTreeNode, 0, len(candidates))
		for _, c := range candidates {
			nodes = append(nodes, c.node)
		}
		return model.Flow{}, nil, duplicateFlowsValidationError(sel, nodes)
	}

	flow, err := s.readFullFlowNode(candidates[0].node)
	if err != nil {
		return model.Flow{}, nil, err
	}

	return flow, candidates[0].ancestors, nil
}

// ResolveFlowFolderSelector on CollectionService delegates to FlowService.
func (s *CollectionService) ResolveFlowFolderSelector(collRoot, selector string) (model.FlowTreeNode, []model.FlowTreeNode, error) {
	flowSvc := NewFlowService(s.fs, s.logger)
	return flowSvc.ResolveFlowFolderSelector(collRoot, selector)
}

// ResolveFlowSelector on CollectionService delegates to FlowService.
func (s *CollectionService) ResolveFlowSelector(collRoot, selector string) (model.Flow, []model.FlowTreeNode, error) {
	flowSvc := NewFlowService(s.fs, s.logger)
	return flowSvc.ResolveFlowSelector(collRoot, selector)
}

// ResolveFlowFolderSelector resolves a FlowFolder by ID or hierarchical path using the given FileSystem.
func ResolveFlowFolderSelector(fs *storage.FileSystem, collRoot, selector string) (model.FlowTreeNode, []model.FlowTreeNode, error) {
	flowSvc := NewFlowService(fs, silentLogger())
	return flowSvc.ResolveFlowFolderSelector(collRoot, selector)
}

// ResolveFlowSelector resolves a Flow by ID or hierarchical path using the given FileSystem.
func ResolveFlowSelector(fs *storage.FileSystem, collRoot, selector string) (model.Flow, []model.FlowTreeNode, error) {
	flowSvc := NewFlowService(fs, silentLogger())
	return flowSvc.ResolveFlowSelector(collRoot, selector)
}

type resolvedFlowNodeCandidate struct {
	node      model.FlowTreeNode
	ancestors []model.FlowTreeNode
}

func (s *FlowService) readFullFlowNode(node model.FlowTreeNode) (model.Flow, error) {
	var flow model.Flow
	if err := s.fs.ReadJSON(node.Path, &flow); err != nil {
		return model.Flow{}, err
	}
	normalizeFlow(&flow, false)
	return flow, nil
}

func isUUIDPrefixCandidate(s string) bool {
	if len(s) < 6 {
		return false
	}
	for i := 0; i < len(s); i++ {
		c := s[i]
		isHex := (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F')
		if !isHex && c != '-' {
			return false
		}
	}
	return true
}

func findFlowFoldersByIDPrefixInTree(nodes []model.FlowTreeNode, prefix string, ancestors []model.FlowTreeNode) []resolvedFlowNodeCandidate {
	var out []resolvedFlowNodeCandidate
	lowerPrefix := strings.ToLower(prefix)
	for _, node := range nodes {
		if node.Type != "flow_folder" {
			continue
		}
		if strings.HasPrefix(strings.ToLower(node.ID), lowerPrefix) {
			out = append(out, resolvedFlowNodeCandidate{
				node:      node,
				ancestors: append([]model.FlowTreeNode{}, ancestors...),
			})
		}
		nextAncestors := append(append([]model.FlowTreeNode{}, ancestors...), node)
		out = append(out, findFlowFoldersByIDPrefixInTree(node.Children, prefix, nextAncestors)...)
	}
	return out
}

func findFlowsByIDPrefixInTree(nodes []model.FlowTreeNode, prefix string, ancestors []model.FlowTreeNode) []resolvedFlowNodeCandidate {
	var out []resolvedFlowNodeCandidate
	lowerPrefix := strings.ToLower(prefix)
	for _, node := range nodes {
		if node.Type == "flow" && strings.HasPrefix(strings.ToLower(node.ID), lowerPrefix) {
			out = append(out, resolvedFlowNodeCandidate{
				node:      node,
				ancestors: append([]model.FlowTreeNode{}, ancestors...),
			})
		}
		if node.Type == "flow_folder" {
			nextAncestors := append(append([]model.FlowTreeNode{}, ancestors...), node)
			out = append(out, findFlowsByIDPrefixInTree(node.Children, prefix, nextAncestors)...)
		}
	}
	return out
}

func findFlowFolderByIDInTree(nodes []model.FlowTreeNode, id string, ancestors []model.FlowTreeNode) (model.FlowTreeNode, []model.FlowTreeNode, bool) {
	for _, node := range nodes {
		if node.Type != "flow_folder" {
			continue
		}
		if node.ID == id {
			return node, ancestors, true
		}
		nextAncestors := append(append([]model.FlowTreeNode{}, ancestors...), node)
		if found, foundAncestors, ok := findFlowFolderByIDInTree(node.Children, id, nextAncestors); ok {
			return found, foundAncestors, true
		}
	}
	return model.FlowTreeNode{}, nil, false
}

func findFlowByIDInTree(nodes []model.FlowTreeNode, id string, ancestors []model.FlowTreeNode) (model.FlowTreeNode, []model.FlowTreeNode, bool) {
	for _, node := range nodes {
		if node.Type == "flow" && node.ID == id {
			return node, ancestors, true
		}
		if node.Type == "flow_folder" {
			nextAncestors := append(append([]model.FlowTreeNode{}, ancestors...), node)
			if found, foundAncestors, ok := findFlowByIDInTree(node.Children, id, nextAncestors); ok {
				return found, foundAncestors, true
			}
		}
	}
	return model.FlowTreeNode{}, nil, false
}

func matchedFlowPrefixLen(node model.FlowTreeNode, parts []string) (int, bool) {
	if len(parts) == 0 {
		return 0, false
	}
	if node.ID == parts[0] {
		return 1, true
	}
	nameParts := splitSelectorSegments(node.Name)
	if len(nameParts) > 0 && len(parts) >= len(nameParts) && segmentsEqualFold(parts[:len(nameParts)], nameParts) {
		return len(nameParts), false
	}
	return 0, false
}

func findFlowFolderCandidatesBySegments(nodes []model.FlowTreeNode, parts []string, ancestors []model.FlowTreeNode) ([]resolvedFlowNodeCandidate, error) {
	type folderPrefixMatch struct {
		node  model.FlowTreeNode
		k     int
		byID  bool
		label string
	}

	var prefixMatches []folderPrefixMatch
	for _, node := range nodes {
		if node.Type != "flow_folder" {
			continue
		}
		if k, byID := matchedFlowPrefixLen(node, parts); k > 0 {
			prefixMatches = append(prefixMatches, folderPrefixMatch{
				node:  node,
				k:     k,
				byID:  byID,
				label: strings.Join(parts[:k], "/"),
			})
		}
	}

	byLen := make(map[int][]folderPrefixMatch)
	for _, m := range prefixMatches {
		byLen[m.k] = append(byLen[m.k], m)
	}

	lengths := make([]int, 0, len(byLen))
	for k := range byLen {
		lengths = append(lengths, k)
	}
	sort.Ints(lengths)

	var results []resolvedFlowNodeCandidate
	for _, k := range lengths {
		group := byLen[k]
		var effectiveGroup []folderPrefixMatch
		for _, m := range group {
			if m.byID {
				effectiveGroup = append(effectiveGroup, m)
			}
		}
		if len(effectiveGroup) == 0 {
			effectiveGroup = group
		}

		if len(effectiveGroup) > 1 {
			ids := make([]string, 0, len(effectiveGroup))
			for _, m := range effectiveGroup {
				ids = append(ids, m.node.ID)
			}
			return nil, fmt.Errorf(
				"%s: có nhiều thư mục flow trùng tên %q (IDs: %s), vui lòng chỉ định UUID cụ thể",
				model.ErrValidation, effectiveGroup[0].label, strings.Join(ids, ", "),
			)
		}

		matched := effectiveGroup[0].node
		if k == len(parts) {
			results = append(results, resolvedFlowNodeCandidate{node: matched, ancestors: ancestors})
		} else {
			nextAncestors := append(append([]model.FlowTreeNode{}, ancestors...), matched)
			sub, err := findFlowFolderCandidatesBySegments(matched.Children, parts[k:], nextAncestors)
			if err != nil {
				return nil, err
			}
			results = append(results, sub...)
		}
	}

	return results, nil
}

func findFlowCandidatesBySegments(nodes []model.FlowTreeNode, parts []string, ancestors []model.FlowTreeNode) ([]resolvedFlowNodeCandidate, error) {
	var results []resolvedFlowNodeCandidate

	// 1. Check flows at the current level that consume all remaining parts
	var idMatches []resolvedFlowNodeCandidate
	var nameMatches []resolvedFlowNodeCandidate
	for _, node := range nodes {
		if node.Type != "flow" {
			continue
		}
		if k, byID := matchedFlowPrefixLen(node, parts); k == len(parts) {
			cand := resolvedFlowNodeCandidate{node: node, ancestors: ancestors}
			if byID {
				idMatches = append(idMatches, cand)
			} else {
				nameMatches = append(nameMatches, cand)
			}
		}
	}
	if len(idMatches) > 0 {
		results = append(results, idMatches...)
	} else if len(nameMatches) > 1 {
		flowNodes := make([]model.FlowTreeNode, 0, len(nameMatches))
		for _, m := range nameMatches {
			flowNodes = append(flowNodes, m.node)
		}
		return nil, duplicateFlowsValidationError(strings.Join(parts, "/"), flowNodes)
	} else if len(nameMatches) == 1 {
		results = append(results, nameMatches[0])
	}

	// 2. Check flow_folders at the current level that consume a strict prefix of parts (k < len(parts))
	type folderPrefixMatch struct {
		node  model.FlowTreeNode
		k     int
		byID  bool
		label string
	}
	byLen := make(map[int][]folderPrefixMatch)
	for _, node := range nodes {
		if node.Type != "flow_folder" {
			continue
		}
		if k, byID := matchedFlowPrefixLen(node, parts); k > 0 && k < len(parts) {
			byLen[k] = append(byLen[k], folderPrefixMatch{
				node:  node,
				k:     k,
				byID:  byID,
				label: strings.Join(parts[:k], "/"),
			})
		}
	}

	lengths := make([]int, 0, len(byLen))
	for k := range byLen {
		lengths = append(lengths, k)
	}
	sort.Ints(lengths)

	for _, k := range lengths {
		group := byLen[k]
		var effectiveGroup []folderPrefixMatch
		for _, m := range group {
			if m.byID {
				effectiveGroup = append(effectiveGroup, m)
			}
		}
		if len(effectiveGroup) == 0 {
			effectiveGroup = group
		}

		if len(effectiveGroup) > 1 {
			ids := make([]string, 0, len(effectiveGroup))
			for _, m := range effectiveGroup {
				ids = append(ids, m.node.ID)
			}
			return nil, fmt.Errorf(
				"%s: có nhiều thư mục flow trùng tên %q (IDs: %s), vui lòng chỉ định UUID cụ thể",
				model.ErrValidation, effectiveGroup[0].label, strings.Join(ids, ", "),
			)
		}

		matched := effectiveGroup[0].node
		nextAncestors := append(append([]model.FlowTreeNode{}, ancestors...), matched)
		sub, err := findFlowCandidatesBySegments(matched.Children, parts[k:], nextAncestors)
		if err != nil {
			return nil, err
		}
		results = append(results, sub...)
	}

	return results, nil
}

func duplicateFlowsValidationError(name string, matches []model.FlowTreeNode) error {
	ids := make([]string, 0, len(matches))
	for _, m := range matches {
		ids = append(ids, m.ID)
	}
	return fmt.Errorf(
		"%s: có nhiều flow trùng tên %q trong cùng thư mục (IDs: %s), vui lòng chỉ định UUID cụ thể",
		model.ErrValidation, name, strings.Join(ids, ", "),
	)
}

func silentLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}
