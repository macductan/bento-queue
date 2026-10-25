package service

import (
	"fmt"
	"io"
	"log/slog"
	"path/filepath"
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

	var results []resolvedNodeCandidate
	for k, group := range byLen {
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

	for k, group := range byLen {
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

func silentLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}
