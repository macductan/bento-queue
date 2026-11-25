package service

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strings"
	"time"

	"github.com/google/uuid"

	"hecto-api/model"
	"hecto-api/slug"
)

var (
	varMaskRegex    = regexp.MustCompile(`\{\{[^}]*\}\}`)
	varTokenRegex   = regexp.MustCompile(`\{\{[^}]+\}\}`)
	schemeRegex     = regexp.MustCompile(`^[a-zA-Z][a-zA-Z0-9+.-]*://`)
	pathParamRe     = regexp.MustCompile(`:([a-zA-Z_][a-zA-Z0-9_-]*)`)
	ValidSyncGroups = []string{"url", "method", "auth", "scripts", "body", "params", "path_params", "headers", "variables"}
)

// GenerateUniqueExampleName generates a non-colliding example name against existing examples.
func GenerateUniqueExampleName(baseName string, existing []model.RequestExample) string {
	used := make(map[string]bool, len(existing))
	for _, ex := range existing {
		if k := strings.ToLower(strings.TrimSpace(ex.Name)); k != "" {
			used[k] = true
		}
	}
	trimmed := strings.TrimSpace(baseName)
	if trimmed == "" {
		trimmed = "Example"
	}
	if !used[strings.ToLower(trimmed)] {
		return trimmed
	}
	for i := 2; ; i++ {
		candidate := fmt.Sprintf("%s %d", trimmed, i)
		if !used[strings.ToLower(candidate)] {
			return candidate
		}
	}
}

// CloneRequestToExample snapshots a Request into a new RequestExample with default sync flags.
func CloneRequestToExample(req model.Request, name string) model.RequestExample {
	now := time.Now()
	trimmedName := strings.TrimSpace(name)
	if trimmedName == "" {
		trimmedName = GenerateUniqueExampleName(fmt.Sprintf("Example %d", len(req.Examples)+1), req.Examples)
	}
	return model.RequestExample{
		ID:         uuid.New().String(),
		Name:       trimmedName,
		Method:     req.Method,
		URL:        req.URL,
		Headers:    cloneKVPairs(req.Headers),
		Params:     cloneKVPairs(req.Params),
		PathParams: cloneKVPairs(req.PathParams),
		Variables:  cloneKVPairs(req.Variables),
		Body:       cloneBody(req.Body),
		Auth:       cloneAuthConfig(req.Auth),
		AuthEnvs:   cloneAuthEnvsMap(req.AuthEnvs),
		Scripts:    cloneScripts(req.Scripts),
		SyncFlags:  model.DefaultExampleSyncFlags(),
		CreatedAt:  now,
		UpdatedAt:  now,
	}
}

func cloneKVPairs(src []model.KVPair) []model.KVPair {
	if src == nil {
		return []model.KVPair{}
	}
	out := make([]model.KVPair, len(src))
	for i, item := range src {
		itemCopy := item
		if item.Options != nil {
			itemCopy.Options = slices.Clone(item.Options)
		}
		out[i] = itemCopy
	}
	return out
}

func cloneBody(src model.Body) model.Body {
	out := src
	if src.FormData != nil {
		out.FormData = cloneKVPairs(src.FormData)
	}
	if src.URLEncoded != nil {
		out.URLEncoded = cloneKVPairs(src.URLEncoded)
	}
	return out
}

func cloneAuthConfig(src *model.AuthConfig) *model.AuthConfig {
	if src == nil {
		return &model.AuthConfig{Type: "inherit"}
	}
	cp := *src
	if src.Bearer != nil {
		b := *src.Bearer
		cp.Bearer = &b
	}
	if src.Basic != nil {
		b := *src.Basic
		cp.Basic = &b
	}
	if src.APIKey != nil {
		k := *src.APIKey
		cp.APIKey = &k
	}
	return &cp
}

func cloneAuthEnvsMap(src map[string]*model.AuthConfig) map[string]*model.AuthConfig {
	if len(src) == 0 {
		return nil
	}
	out := make(map[string]*model.AuthConfig, len(src))
	for k, v := range src {
		if v != nil {
			out[k] = cloneAuthConfig(v)
		}
	}
	return out
}

func cloneScripts(src *model.Scripts) *model.Scripts {
	if src == nil {
		return nil
	}
	cp := *src
	return &cp
}

func splitPreservingVars(str string, delimiter byte, limit int) []string {
	var result []string
	var current strings.Builder
	inVarDepth := 0
	splitsCount := 0

	for i := 0; i < len(str); i++ {
		if limit > 0 && splitsCount >= limit-1 {
			current.WriteString(str[i:])
			break
		}
		if str[i] == '{' && i+1 < len(str) && str[i+1] == '{' {
			inVarDepth++
			current.WriteString("{{")
			i++
			continue
		}
		if str[i] == '}' && i+1 < len(str) && str[i+1] == '}' && inVarDepth > 0 {
			inVarDepth--
			current.WriteString("}}")
			i++
			continue
		}
		if inVarDepth == 0 && str[i] == delimiter {
			result = append(result, current.String())
			current.Reset()
			splitsCount++
			continue
		}
		current.WriteByte(str[i])
	}
	result = append(result, current.String())
	return result
}

func encodeURIComponentGo(s string) string {
	var b strings.Builder
	for i := 0; i < len(s); i++ {
		c := s[i]
		isUnreserved := (c >= 'A' && c <= 'Z') ||
			(c >= 'a' && c <= 'z') ||
			(c >= '0' && c <= '9') ||
			c == '-' || c == '_' || c == '.' || c == '!' ||
			c == '~' || c == '*' || c == '\'' || c == '(' || c == ')'
		if isUnreserved {
			b.WriteByte(c)
		} else {
			fmt.Fprintf(&b, "%%%02X", c)
		}
	}
	return b.String()
}

func encodeQueryComponentPreservingVars(str string) string {
	if str == "" {
		return ""
	}
	locs := varTokenRegex.FindAllStringIndex(str, -1)
	if len(locs) == 0 {
		return encodeURIComponentGo(str)
	}
	var b strings.Builder
	last := 0
	for _, loc := range locs {
		if loc[0] > last {
			b.WriteString(encodeURIComponentGo(str[last:loc[0]]))
		}
		b.WriteString(str[loc[0]:loc[1]])
		last = loc[1]
	}
	if last < len(str) {
		b.WriteString(encodeURIComponentGo(str[last:]))
	}
	return b.String()
}

// SplitURLPreservingVars splits a URL into baseURL (before ?/#), rawQuery (without ?), and hash (including #),
// preserving {{...}} blocks verbatim.
func SplitURLPreservingVars(rawURL string) (baseURL, rawQuery, hash string) {
	if rawURL == "" {
		return "", "", ""
	}
	hashParts := splitPreservingVars(rawURL, '#', 2)
	withoutHash := hashParts[0]
	if len(hashParts) > 1 {
		hash = "#" + hashParts[1]
	}
	queryParts := splitPreservingVars(withoutHash, '?', 2)
	baseURL = queryParts[0]
	if len(queryParts) > 1 {
		rawQuery = queryParts[1]
	}
	return baseURL, rawQuery, hash
}

// BuildQueryString builds a query string from enabled KVPairs with non-empty keys.
func BuildQueryString(params []model.KVPair) string {
	if len(params) == 0 {
		return ""
	}
	var parts []string
	for _, p := range params {
		if !p.Enabled || p.Key == "" {
			continue
		}
		ek := encodeQueryComponentPreservingVars(p.Key)
		if p.Value == "" {
			parts = append(parts, ek)
		} else {
			parts = append(parts, ek+"="+encodeQueryComponentPreservingVars(p.Value))
		}
	}
	return strings.Join(parts, "&")
}

// UpdateURLWithParams replaces the query string on rawURL while preserving baseURL and hash.
func UpdateURLWithParams(rawURL string, params []model.KVPair) string {
	baseURL, _, hash := SplitURLPreservingVars(rawURL)
	qs := BuildQueryString(params)
	if rawURL == "" {
		if qs != "" {
			return "?" + qs
		}
		return ""
	}
	if qs == "" {
		return baseURL + hash
	}
	return baseURL + "?" + qs + hash
}

// ExtractPathParamKeys extracts unique :param token names from a URL path outside {{...}} blocks.
func ExtractPathParamKeys(rawURL string) []string {
	if rawURL == "" {
		return nil
	}
	masked := varMaskRegex.ReplaceAllStringFunc(rawURL, func(m string) string {
		return strings.Repeat(" ", len(m))
	})
	scanEnd := len(masked)
	if idx := strings.IndexAny(masked, "?#"); idx >= 0 {
		scanEnd = idx
	}
	scanStart := 0
	if loc := schemeRegex.FindStringIndex(masked); loc != nil {
		afterScheme := loc[1]
		slashIdx := strings.IndexByte(masked[afterScheme:], '/')
		if slashIdx < 0 || afterScheme+slashIdx >= scanEnd {
			return nil
		}
		scanStart = afterScheme + slashIdx
	} else if !strings.HasPrefix(masked, "/") && !strings.HasPrefix(masked, ":") {
		slashIdx := strings.IndexByte(masked, '/')
		if slashIdx < 0 || slashIdx >= scanEnd {
			return nil
		}
		scanStart = slashIdx
	}

	segment := masked[scanStart:scanEnd]
	matches := pathParamRe.FindAllStringSubmatchIndex(segment, -1)
	if len(matches) == 0 {
		return nil
	}
	seen := make(map[string]bool, len(matches))
	keys := make([]string, 0, len(matches))
	for _, m := range matches {
		endIdx := m[1]
		if endIdx+2 <= len(segment) && segment[endIdx:endIdx+2] == "//" {
			continue
		}
		name := segment[m[2]:m[3]]
		if !seen[name] {
			seen[name] = true
			keys = append(keys, name)
		}
	}
	return keys
}

// ReconcilePathParams updates the path_params list to match :param keys in rawURL while preserving existing values/options.
func ReconcilePathParams(rawURL string, current []model.KVPair) []model.KVPair {
	keys := ExtractPathParamKeys(rawURL)
	if len(keys) == 0 {
		return []model.KVPair{}
	}
	existingByKey := make(map[string]model.KVPair, len(current))
	for _, item := range current {
		if item.Key != "" {
			if _, exists := existingByKey[item.Key]; !exists {
				existingByKey[item.Key] = item
			}
		}
	}
	out := make([]model.KVPair, 0, len(keys))
	for _, k := range keys {
		if existing, ok := existingByKey[k]; ok {
			cp := existing
			cp.Key = k
			if existing.Options != nil {
				cp.Options = slices.Clone(existing.Options)
			}
			out = append(out, cp)
		} else {
			out = append(out, model.KVPair{
				Key:     k,
				Value:   "",
				Enabled: true,
			})
		}
	}
	return out
}

func mergeBaseURLPreservingExampleQuery(defaultURL, exampleURL string, exampleParams []model.KVPair) string {
	defBase, _, defHash := SplitURLPreservingVars(defaultURL)
	_, exRawQuery, exHash := SplitURLPreservingVars(exampleURL)
	qs := BuildQueryString(exampleParams)
	if qs == "" && exampleParams == nil && exRawQuery != "" {
		qs = exRawQuery
	}
	hash := exHash
	if hash == "" {
		hash = defHash
	}
	if qs != "" {
		return defBase + "?" + qs + hash
	}
	return defBase + hash
}

// ResolveEffectiveRequestForExample overlays synced field groups from the Default request onto an Example snapshot.
func ResolveEffectiveRequestForExample(defaultReq model.Request, example model.RequestExample) model.Request {
	flags := example.SyncFlags
	effective := model.Request{
		ID:        defaultReq.ID,
		Name:      defaultReq.Name,
		CreatedAt: defaultReq.CreatedAt,
		UpdatedAt: defaultReq.UpdatedAt,
		Examples:  defaultReq.Examples,
	}

	if flags.Method {
		effective.Method = defaultReq.Method
	} else {
		effective.Method = example.Method
	}

	if flags.Params {
		effective.Params = cloneKVPairs(defaultReq.Params)
	} else {
		effective.Params = cloneKVPairs(example.Params)
	}

	switch {
	case flags.URL && flags.Params:
		effective.URL = defaultReq.URL
	case flags.URL && !flags.Params:
		effective.URL = mergeBaseURLPreservingExampleQuery(defaultReq.URL, example.URL, effective.Params)
	case !flags.URL && flags.Params:
		effective.URL = UpdateURLWithParams(example.URL, effective.Params)
	default:
		effective.URL = example.URL
	}

	if flags.PathParams {
		effective.PathParams = cloneKVPairs(defaultReq.PathParams)
	} else if flags.URL {
		effective.PathParams = ReconcilePathParams(effective.URL, example.PathParams)
	} else {
		effective.PathParams = cloneKVPairs(example.PathParams)
	}

	if flags.Headers {
		effective.Headers = cloneKVPairs(defaultReq.Headers)
	} else {
		effective.Headers = cloneKVPairs(example.Headers)
	}

	if flags.Variables {
		effective.Variables = cloneKVPairs(defaultReq.Variables)
	} else {
		effective.Variables = cloneKVPairs(example.Variables)
	}

	if flags.Body {
		effective.Body = cloneBody(defaultReq.Body)
	} else {
		effective.Body = cloneBody(example.Body)
	}

	if flags.Auth {
		effective.Auth = cloneAuthConfig(defaultReq.Auth)
		effective.AuthEnvs = cloneAuthEnvsMap(defaultReq.AuthEnvs)
	} else {
		effective.Auth = cloneAuthConfig(example.Auth)
		effective.AuthEnvs = cloneAuthEnvsMap(example.AuthEnvs)
	}

	if flags.Scripts {
		effective.Scripts = cloneScripts(defaultReq.Scripts)
	} else {
		effective.Scripts = cloneScripts(example.Scripts)
	}

	if effective.Auth == nil {
		effective.Auth = &model.AuthConfig{Type: "inherit"}
	}
	if effective.Headers == nil {
		effective.Headers = []model.KVPair{}
	}
	if effective.Params == nil {
		effective.Params = []model.KVPair{}
	}
	return effective
}

// SyncExampleFromDefault updates an example's stored snapshot fields from defaultReq.
// If groups is nil/empty, syncs all groups where ex.SyncFlags[group] is true.
func SyncExampleFromDefault(defaultReq model.Request, ex model.RequestExample, groups []string) model.RequestExample {
	useGroup := func(name string, flagVal bool) bool {
		if len(groups) == 0 {
			return flagVal
		}
		for _, g := range groups {
			if strings.EqualFold(strings.TrimSpace(g), name) {
				return true
			}
		}
		return false
	}

	syncURL := useGroup("url", ex.SyncFlags.URL)
	syncMethod := useGroup("method", ex.SyncFlags.Method)
	syncAuth := useGroup("auth", ex.SyncFlags.Auth)
	syncScripts := useGroup("scripts", ex.SyncFlags.Scripts)
	syncBody := useGroup("body", ex.SyncFlags.Body)
	syncParams := useGroup("params", ex.SyncFlags.Params)
	syncPathParams := useGroup("path_params", ex.SyncFlags.PathParams)
	syncHeaders := useGroup("headers", ex.SyncFlags.Headers)
	syncVariables := useGroup("variables", ex.SyncFlags.Variables)

	if syncMethod {
		ex.Method = defaultReq.Method
	}
	if syncParams {
		ex.Params = cloneKVPairs(defaultReq.Params)
	}
	switch {
	case syncURL && syncParams:
		ex.URL = defaultReq.URL
	case syncURL && !syncParams:
		ex.URL = mergeBaseURLPreservingExampleQuery(defaultReq.URL, ex.URL, ex.Params)
	case !syncURL && syncParams:
		ex.URL = UpdateURLWithParams(ex.URL, ex.Params)
	}

	if syncPathParams {
		ex.PathParams = cloneKVPairs(defaultReq.PathParams)
	} else if syncURL {
		ex.PathParams = ReconcilePathParams(ex.URL, ex.PathParams)
	}

	if syncHeaders {
		ex.Headers = cloneKVPairs(defaultReq.Headers)
	}
	if syncVariables {
		ex.Variables = cloneKVPairs(defaultReq.Variables)
	}
	if syncBody {
		ex.Body = cloneBody(defaultReq.Body)
	}
	if syncAuth {
		ex.Auth = cloneAuthConfig(defaultReq.Auth)
		ex.AuthEnvs = cloneAuthEnvsMap(defaultReq.AuthEnvs)
	}
	if syncScripts {
		ex.Scripts = cloneScripts(defaultReq.Scripts)
	}
	ex.UpdatedAt = time.Now()
	return ex
}

// SyncAllExamplesFromDefault updates all examples in req according to their SyncFlags (or explicit groups).
func SyncAllExamplesFromDefault(req *model.Request, groups []string) {
	if req == nil || len(req.Examples) == 0 {
		return
	}
	for i := range req.Examples {
		req.Examples[i] = SyncExampleFromDefault(*req, req.Examples[i], groups)
	}
}

// ResolveExampleSelector finds an example on req by UUID (exact or case-insensitive) or case-insensitive Name.
func ResolveExampleSelector(req model.Request, selector string) (int, model.RequestExample, error) {
	sel := strings.TrimSpace(selector)
	if sel == "" {
		return -1, model.RequestExample{}, fmt.Errorf("%s: example selector <id|name> is required", model.ErrValidation)
	}
	for i, ex := range req.Examples {
		if ex.ID == sel {
			return i, ex, nil
		}
	}
	for i, ex := range req.Examples {
		if strings.EqualFold(ex.ID, sel) {
			return i, ex, nil
		}
	}
	var matchedIndices []int
	for i, ex := range req.Examples {
		if strings.EqualFold(strings.TrimSpace(ex.Name), sel) {
			matchedIndices = append(matchedIndices, i)
		}
	}
	if len(matchedIndices) == 1 {
		idx := matchedIndices[0]
		return idx, req.Examples[idx], nil
	}
	if len(matchedIndices) > 1 {
		ids := make([]string, 0, len(matchedIndices))
		for _, idx := range matchedIndices {
			ids = append(ids, req.Examples[idx].ID)
		}
		return -1, model.RequestExample{}, fmt.Errorf(
			"%s: multiple examples match %q on request %q (IDs: %s); specify an example ID",
			model.ErrValidation, sel, req.Name, strings.Join(ids, ", "),
		)
	}
	return -1, model.RequestExample{}, fmt.Errorf("%s: example %q not found on request %q", model.ErrNotFound, sel, req.Name)
}

// DetachExample promotes an example into a standalone Request in the same folder and deletes it from the source Request.
func (s *RequestService) DetachExample(reqID, exampleSelector, newName string) model.Result {
	path, err := s.fs.FindByUUID(reqID)
	if err != nil {
		return model.NewError(storageErrCode(err), ErrRequestNotFound)
	}
	if !strings.HasSuffix(path, ".json") || isPathInFlowsDir(s.fs, "", path, true) {
		return model.NewError(model.ErrValidation, ErrRequestFileInvalid)
	}

	var req model.Request
	if err := s.fs.ReadJSON(path, &req); err != nil {
		return model.NewError(storageErrCode(err), ErrRequestReadFailed)
	}

	exIdx, ex, err := ResolveExampleSelector(req, exampleSelector)
	if err != nil {
		if strings.HasPrefix(err.Error(), model.ErrValidation+": ") {
			return model.NewError(model.ErrValidation, strings.TrimPrefix(err.Error(), model.ErrValidation+": "))
		}
		return model.NewError(model.ErrNotFound, strings.TrimPrefix(err.Error(), model.ErrNotFound+": "))
	}

	effective := ResolveEffectiveRequestForExample(req, ex)
	now := time.Now()
	detachedName := strings.TrimSpace(newName)
	if detachedName == "" {
		if strings.TrimSpace(ex.Name) != "" {
			detachedName = fmt.Sprintf("%s - %s", req.Name, strings.TrimSpace(ex.Name))
		} else {
			detachedName = req.Name + " (Example)"
		}
	}
	if len([]rune(detachedName)) > 255 {
		detachedName = string([]rune(detachedName)[:255])
	}

	effective.ID = uuid.New().String()
	effective.Name = detachedName
	effective.Examples = nil
	effective.CreatedAt = now
	effective.UpdatedAt = now

	dir := filepath.Dir(path)
	newPath := filepath.Join(dir, slug.RequestFilename(effective.ID))
	if err := s.fs.WriteJSON(newPath, effective); err != nil {
		return model.NewError(storageErrCode(err), ErrRequestSaveFailed)
	}
	s.fs.IndexSet(effective.ID, newPath)

	req.Examples = append(req.Examples[:exIdx], req.Examples[exIdx+1:]...)
	req.UpdatedAt = now
	if err := s.fs.WriteJSON(path, req); err != nil {
		_ = os.Remove(newPath)
		s.fs.IndexDelete(effective.ID)
		return model.NewError(storageErrCode(err), ErrRequestSaveFailed)
	}

	return model.NewSuccess(map[string]interface{}{
		"request":             effective,
		"detached_example_id": ex.ID,
		"source_request_id":   req.ID,
	})
}
