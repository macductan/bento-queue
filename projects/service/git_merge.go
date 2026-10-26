package service

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"time"

	"hecto-api/model"
)

const (
	hectoStashConflictFile = "HECTO_STASH_CONFLICT"
	hectoStashMessage      = "hecto-stash-before-pull"
)

var fieldLabels = map[string]string{
	"name":                  "Tên (Name)",
	"method":                "HTTP Method",
	"url":                   "URL",
	"description":           "Mô tả (Description)",
	"active_env_id":         "Môi trường đang chọn (Active Environment)",
	"layout":                "Bố cục sơ đồ (Layout)",
	"direction":             "Bố cục sơ đồ (Layout)",
	"timeout_ms":            "Thời gian chờ mặc định (Timeout ms)",
	"max_steps":             "Giới hạn số bước tối đa (Max Steps)",
	"nodes":                 "Sơ đồ bước thực thi (Flow Nodes)",
	"order":                 "Thứ tự sắp xếp (Order)",
	"body.type":             "Body Type",
	"body.content":          "Body Content",
	"auth.type":             "Auth Type",
	"auth.bearer.token":     "Bearer Token",
	"auth.basic.username":   "Basic Auth Username",
	"auth.basic.password":   "Basic Auth Password",
	"auth.apiKey.key":       "API Key Name",
	"auth.apiKey.value":     "API Key Value",
	"auth.apiKey.addTo":     "API Key Location (addTo)",
	"scripts.pre_request":   "Pre-request Script",
	"scripts.post_response": "Post-response Script",
}

var topLevelKVPairFields = map[string]string{
	"headers":     "Header",
	"params":      "Query Param",
	"path_params": "Path Param",
	"variables":   "Variable",
}

func (s *GitSyncService) stashConflictFilePath(collDir string) string {
	return filepath.Join(collDir, ".git", hectoStashConflictFile)
}

func (s *GitSyncService) isStashConflict(collDir string) bool {
	if s.fs.Exists(filepath.Join(collDir, ".git", "MERGE_HEAD")) {
		return false
	}
	return s.fs.Exists(s.stashConflictFilePath(collDir))
}

func (s *GitSyncService) writeStashConflictMarker(collDir, prePullHead string, extraFiles []string) {
	var lines []string
	lines = append(lines, strings.TrimSpace(prePullHead))
	seen := make(map[string]bool)
	for _, f := range extraFiles {
		clean := strings.TrimSpace(filepath.ToSlash(f))
		if clean != "" && !seen[clean] {
			seen[clean] = true
			lines = append(lines, clean)
		}
	}
	content := strings.Join(lines, "\n") + "\n"
	_ = os.WriteFile(s.stashConflictFilePath(collDir), []byte(content), 0644)
}

func (s *GitSyncService) readStashConflictMarker(collDir string) (string, []string) {
	raw, err := os.ReadFile(s.stashConflictFilePath(collDir))
	if err != nil {
		return "", nil
	}
	lines := strings.Split(strings.ReplaceAll(string(raw), "\r\n", "\n"), "\n")
	if len(lines) == 0 {
		return "", nil
	}
	prePullHead := strings.TrimSpace(lines[0])
	var extraFiles []string
	for _, l := range lines[1:] {
		trimmed := strings.TrimSpace(l)
		if trimmed != "" {
			extraFiles = append(extraFiles, trimmed)
		}
	}
	return prePullHead, extraFiles
}

func (s *GitSyncService) removeStashConflictFileEntry(collDir, relPath string) {
	if !s.fs.Exists(s.stashConflictFilePath(collDir)) {
		return
	}
	prePullHead, extra := s.readStashConflictMarker(collDir)
	target := filepath.ToSlash(strings.TrimSpace(relPath))
	var remaining []string
	for _, f := range extra {
		if filepath.ToSlash(f) != target {
			remaining = append(remaining, f)
		}
	}
	s.writeStashConflictMarker(collDir, prePullHead, remaining)
}

func (s *GitSyncService) clearStashConflictMarker(collDir string) {
	_ = os.Remove(s.stashConflictFilePath(collDir))
}

func (s *GitSyncService) dropHectoStashIfPresent(collDir string) {
	out, err := s.runGit(collDir, "stash", "list", "-n", "1")
	if err == nil && strings.Contains(out, hectoStashMessage) {
		_, _ = s.runGit(collDir, "stash", "drop", "stash@{0}")
	}
}

func (s *GitSyncService) hasHectoStash(collDir string) bool {
	out, err := s.runGit(collDir, "stash", "list", "-n", "1")
	return err == nil && strings.Contains(out, hectoStashMessage)
}

func (s *GitSyncService) readGitBlob(collDir, rev string) (string, bool) {
	out, err := s.runGit(collDir, "show", rev)
	if err != nil {
		return "", false
	}
	return out, true
}

// readConflictStages reads BASE, OURS (Local), and THEIRS (Remote) blobs from Git index.
// When isStashPop is true (conflict caused by git stash pop without MERGE_HEAD),
// Git places Updated upstream (Remote) in stage :2: and Stashed changes (Local) in stage :3:,
// so we invert :3: -> OURS (Local) and :2: -> THEIRS (Remote).
func (s *GitSyncService) readConflictStages(collDir, relPath string, isStashPop bool) (baseRaw string, baseExists bool, oursRaw string, oursExists bool, theirsRaw string, theirsExists bool) {
	slashPath := filepath.ToSlash(relPath)
	baseRaw, baseExists = s.readGitBlob(collDir, ":1:"+slashPath)
	if isStashPop {
		oursRaw, oursExists = s.readGitBlob(collDir, ":3:"+slashPath)
		theirsRaw, theirsExists = s.readGitBlob(collDir, ":2:"+slashPath)
		if !oursExists && !theirsExists {
			// Untracked stash collision ("already exists, no checkout"):
			// Local untracked file is in stash@{0}^3 (or stash@{0}), Remote is in HEAD.
			oursRaw, oursExists = s.readGitBlob(collDir, "stash@{0}^3:"+slashPath)
			if !oursExists {
				oursRaw, oursExists = s.readGitBlob(collDir, "stash@{0}:"+slashPath)
			}
			theirsRaw, theirsExists = s.readGitBlob(collDir, "HEAD:"+slashPath)
		}
	} else {
		oursRaw, oursExists = s.readGitBlob(collDir, ":2:"+slashPath)
		theirsRaw, theirsExists = s.readGitBlob(collDir, ":3:"+slashPath)
	}
	return
}

func detectEntityMeta(relPath string, baseObj, oursObj, theirsObj map[string]interface{}) (string, string) {
	slashPath := filepath.ToSlash(strings.TrimSpace(relPath))
	lowerPath := strings.ToLower(slashPath)

	entityType := "request"
	if !strings.HasSuffix(lowerPath, ".json") {
		entityType = "raw"
	} else if slashPath == collectionFileName {
		entityType = "collection"
	} else if strings.HasPrefix(slashPath, "flows/") {
		if slashPath == "flows/"+folderMetaFile || strings.HasSuffix(slashPath, "/"+folderMetaFile) {
			entityType = "flow_folder"
		} else {
			entityType = "flow"
		}
	} else if slashPath == folderMetaFile || strings.HasSuffix(slashPath, "/"+folderMetaFile) {
		entityType = "folder"
	} else if strings.HasPrefix(slashPath, "environments/") {
		entityType = "environment"
	}

	entityName := ""
	for _, obj := range []map[string]interface{}{oursObj, theirsObj, baseObj} {
		if obj == nil {
			continue
		}
		if n, ok := obj["name"].(string); ok && strings.TrimSpace(n) != "" {
			entityName = strings.TrimSpace(n)
			break
		}
	}
	if entityName == "" {
		if entityType == "folder" || entityType == "flow_folder" {
			dir := filepath.Base(filepath.Dir(slashPath))
			if dir != "." && dir != "/" {
				entityName = dir
			} else {
				entityName = slashPath
			}
		} else {
			entityName = filepath.Base(slashPath)
		}
	}

	return entityType, entityName
}

func parseJSONObject(raw string) (map[string]interface{}, bool) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return nil, false
	}
	var obj map[string]interface{}
	dec := json.NewDecoder(strings.NewReader(trimmed))
	if err := dec.Decode(&obj); err != nil || obj == nil {
		return nil, false
	}
	return obj, true
}

func cloneJSONMap(src map[string]interface{}) map[string]interface{} {
	if src == nil {
		return nil
	}
	raw, err := json.Marshal(src)
	if err != nil {
		return nil
	}
	var dst map[string]interface{}
	_ = json.Unmarshal(raw, &dst)
	return dst
}

func cloneJSONValue(v interface{}) interface{} {
	if v == nil {
		return nil
	}
	raw, err := json.Marshal(v)
	if err != nil {
		return v
	}
	var dst interface{}
	_ = json.Unmarshal(raw, &dst)
	return dst
}

func jsonEqual(a, b interface{}) bool {
	if a == nil && b == nil {
		return true
	}
	if a == nil || b == nil {
		return false
	}
	if reflect.DeepEqual(a, b) {
		return true
	}
	ab, err1 := json.Marshal(a)
	bb, err2 := json.Marshal(b)
	if err1 != nil || err2 != nil {
		return false
	}
	return bytes.Equal(ab, bb)
}

func friendlyFieldLabel(fieldPath string) string {
	if lbl, ok := fieldLabels[fieldPath]; ok {
		return lbl
	}
	if strings.HasPrefix(fieldPath, "body.content.") {
		subKey := strings.TrimPrefix(fieldPath, "body.content.")
		return "Body JSON: " + subKey
	}
	if strings.HasPrefix(fieldPath, "auth_envs.") {
		rest := strings.TrimPrefix(fieldPath, "auth_envs.")
		parts := strings.SplitN(rest, ".", 2)
		if len(parts) == 2 {
			subLbl := friendlyFieldLabel("auth." + parts[1])
			return fmt.Sprintf("Auth (%s) — %s", parts[0], subLbl)
		}
	}
	return fieldPath
}

func parseKVPairs(val interface{}) []model.KVPair {
	if val == nil {
		return nil
	}
	raw, err := json.Marshal(val)
	if err != nil {
		return nil
	}
	var list []model.KVPair
	if err := json.Unmarshal(raw, &list); err != nil {
		return nil
	}
	var filtered []model.KVPair
	for _, kv := range list {
		// Filter out completely empty draft rows
		if strings.TrimSpace(kv.Key) == "" && strings.TrimSpace(kv.Value) == "" {
			continue
		}
		filtered = append(filtered, kv)
	}
	return filtered
}

func kvEqual(a, b model.KVPair) bool {
	return a.Key == b.Key &&
		a.Value == b.Value &&
		a.Enabled == b.Enabled &&
		a.Description == b.Description
}

func kvToMap(kv model.KVPair) map[string]interface{} {
	m := map[string]interface{}{
		"key":     kv.Key,
		"value":   kv.Value,
		"enabled": kv.Enabled,
	}
	if kv.Description != "" {
		m["description"] = kv.Description
	}
	return m
}

func indexKVPairsByOccurrence(list []model.KVPair) (map[string]model.KVPair, []string) {
	counts := make(map[string]int, len(list))
	indexed := make(map[string]model.KVPair, len(list))
	order := make([]string, 0, len(list))
	for _, kv := range list {
		idx := counts[kv.Key]
		counts[kv.Key] = idx + 1
		occKey := fmt.Sprintf("%s#%d", kv.Key, idx)
		indexed[occKey] = kv
		order = append(order, occKey)
	}
	return indexed, order
}

func splitOccurrenceKey(occKey string) (string, int) {
	lastHash := strings.LastIndex(occKey, "#")
	if lastHash < 0 {
		return occKey, 0
	}
	rawKey := occKey[:lastHash]
	var idx int
	_, _ = fmt.Sscanf(occKey[lastHash+1:], "%d", &idx)
	return rawKey, idx
}

func mergeKVPairList(fieldPrefix, labelPrefix string, baseVal, oursVal, theirsVal interface{}) ([]interface{}, []model.GitFieldConflict) {
	baseList := parseKVPairs(baseVal)
	oursList := parseKVPairs(oursVal)
	theirsList := parseKVPairs(theirsVal)

	baseMap, _ := indexKVPairsByOccurrence(baseList)
	oursMap, oursOrder := indexKVPairsByOccurrence(oursList)
	theirsMap, theirsOrder := indexKVPairsByOccurrence(theirsList)

	seen := make(map[string]bool, len(oursOrder)+len(theirsOrder))
	orderedKeys := make([]string, 0, len(oursOrder)+len(theirsOrder))
	for _, k := range oursOrder {
		if !seen[k] {
			seen[k] = true
			orderedKeys = append(orderedKeys, k)
		}
	}
	for _, k := range theirsOrder {
		if !seen[k] {
			seen[k] = true
			orderedKeys = append(orderedKeys, k)
		}
	}

	merged := make([]interface{}, 0, len(orderedKeys))
	var conflicts []model.GitFieldConflict

	for _, occKey := range orderedKeys {
		bVal, inB := baseMap[occKey]
		oVal, inO := oursMap[occKey]
		tVal, inT := theirsMap[occKey]

		oSameAsT := (inO == inT) && (!inO || kvEqual(oVal, tVal))
		if oSameAsT {
			if inO {
				merged = append(merged, kvToMap(oVal))
			}
			continue
		}

		oSameAsB := (inO == inB) && (!inO || kvEqual(oVal, bVal))
		if oSameAsB {
			// Only Remote (Theirs) modified, added, or deleted this element
			if inT {
				merged = append(merged, kvToMap(tVal))
			}
			continue
		}

		tSameAsB := (inT == inB) && (!inT || kvEqual(tVal, bVal))
		if tSameAsB {
			// Only Local (Ours) modified, added, or deleted this element
			if inO {
				merged = append(merged, kvToMap(oVal))
			}
			continue
		}

		// Both Ours and Theirs modified/added/deleted this occurrence differently
		rawKey, occIdx := splitOccurrenceKey(occKey)
		lbl := fmt.Sprintf("%s: %s", labelPrefix, rawKey)
		if occIdx > 0 {
			lbl = fmt.Sprintf("%s: %s #%d", labelPrefix, rawKey, occIdx+1)
		}

		var baseInterface, oursInterface, theirsInterface interface{}
		if inB {
			baseInterface = kvToMap(bVal)
		}
		if inO {
			oursInterface = kvToMap(oVal)
			merged = append(merged, kvToMap(oVal))
		}
		if inT {
			theirsInterface = kvToMap(tVal)
		}

		conflicts = append(conflicts, model.GitFieldConflict{
			FieldPath:   fmt.Sprintf("%s.%s", fieldPrefix, occKey),
			Label:       lbl,
			BaseValue:   baseInterface,
			OursValue:   oursInterface,
			TheirsValue: theirsInterface,
		})
	}

	return merged, conflicts
}

func sortedUnionKeys(maps ...map[string]interface{}) []string {
	seen := make(map[string]bool)
	var keys []string
	for _, m := range maps {
		for k := range m {
			if !seen[k] {
				seen[k] = true
				keys = append(keys, k)
			}
		}
	}
	sort.Strings(keys)
	return keys
}

func asMap(v interface{}) (map[string]interface{}, bool) {
	if v == nil {
		return nil, false
	}
	m, ok := v.(map[string]interface{})
	return m, ok
}

func mergeNestedObject3Way(pathPrefix string, baseMap, oursMap, theirsMap map[string]interface{}) (map[string]interface{}, []model.GitFieldConflict) {
	keys := sortedUnionKeys(baseMap, oursMap, theirsMap)
	merged := make(map[string]interface{}, len(keys))
	var conflicts []model.GitFieldConflict

	for _, k := range keys {
		fieldPath := k
		if pathPrefix != "" {
			fieldPath = pathPrefix + "." + k
		}

		var bVal, oVal, tVal interface{}
		var inB, inO, inT bool
		if baseMap != nil {
			bVal, inB = baseMap[k]
		}
		if oursMap != nil {
			oVal, inO = oursMap[k]
		}
		if theirsMap != nil {
			tVal, inT = theirsMap[k]
		}

		bSub, bIsMap := asMap(bVal)
		oSub, oIsMap := asMap(oVal)
		tSub, tIsMap := asMap(tVal)

		if (oIsMap && tIsMap) || (oIsMap && !inT && bIsMap) || (tIsMap && !inO && bIsMap) {
			if !inO && inB && jsonEqual(tVal, bVal) {
				// Deleted in Ours, unchanged in Theirs
				continue
			}
			if !inT && inB && jsonEqual(oVal, bVal) {
				// Deleted in Theirs, unchanged in Ours
				continue
			}
			if oIsMap && tIsMap {
				subMerged, subConflicts := mergeNestedObject3Way(fieldPath, bSub, oSub, tSub)
				merged[k] = subMerged
				conflicts = append(conflicts, subConflicts...)
				continue
			}
		}

		// Standard 3-way leaf scalar / array comparison
		if inO == inT && (!inO || jsonEqual(oVal, tVal)) {
			if inO {
				merged[k] = cloneJSONValue(oVal)
			}
			continue
		}
		if inO == inB && (!inO || jsonEqual(oVal, bVal)) {
			if inT {
				merged[k] = cloneJSONValue(tVal)
			}
			continue
		}
		if inT == inB && (!inT || jsonEqual(tVal, bVal)) {
			if inO {
				merged[k] = cloneJSONValue(oVal)
			}
			continue
		}

		// Conflict on leaf field
		if inO {
			merged[k] = cloneJSONValue(oVal)
		}
		conflicts = append(conflicts, model.GitFieldConflict{
			FieldPath:   fieldPath,
			Label:       friendlyFieldLabel(fieldPath),
			BaseValue:   cloneJSONValue(bVal),
			OursValue:   cloneJSONValue(oVal),
			TheirsValue: cloneJSONValue(tVal),
		})
	}

	return merged, conflicts
}

func mergeBodyObject3Way(baseBody, oursBody, theirsBody map[string]interface{}) (map[string]interface{}, []model.GitFieldConflict) {
	merged := make(map[string]interface{})
	var conflicts []model.GitFieldConflict

	// 1. Merge body.type
	var bType, oType, tType interface{}
	if baseBody != nil {
		bType = baseBody["type"]
	}
	if oursBody != nil {
		oType = oursBody["type"]
	}
	if theirsBody != nil {
		tType = theirsBody["type"]
	}

	var mergedType interface{}
	if jsonEqual(oType, tType) {
		mergedType = oType
	} else if jsonEqual(oType, bType) {
		mergedType = tType
	} else if jsonEqual(tType, bType) {
		mergedType = oType
	} else {
		mergedType = oType
		conflicts = append(conflicts, model.GitFieldConflict{
			FieldPath:   "body.type",
			Label:       friendlyFieldLabel("body.type"),
			BaseValue:   bType,
			OursValue:   oType,
			TheirsValue: tType,
		})
	}
	if mergedType != nil {
		merged["type"] = mergedType
	}

	// 2. Merge body.content (with deep JSON object recursion when body.type == "json")
	var bContent, oContent, tContent interface{}
	if baseBody != nil {
		bContent = baseBody["content"]
	}
	if oursBody != nil {
		oContent = oursBody["content"]
	}
	if theirsBody != nil {
		tContent = theirsBody["content"]
	}

	if jsonEqual(oContent, tContent) {
		if oContent != nil {
			merged["content"] = oContent
		} else {
			merged["content"] = ""
		}
	} else if jsonEqual(oContent, bContent) {
		if tContent != nil {
			merged["content"] = tContent
		} else {
			merged["content"] = ""
		}
	} else if jsonEqual(tContent, bContent) {
		if oContent != nil {
			merged["content"] = oContent
		} else {
			merged["content"] = ""
		}
	} else {
		// Both Ours and Theirs modified body.content differently from Base
		typeStr, _ := mergedType.(string)
		oStr, oIsStr := oContent.(string)
		tStr, tIsStr := tContent.(string)
		bStr, _ := bContent.(string)

		handledAsJSON := false
		if len(conflicts) == 0 && typeStr == "json" && oIsStr && tIsStr {
			oJsonMap, oOk := parseJSONObject(oStr)
			tJsonMap, tOk := parseJSONObject(tStr)
			bJsonMap := map[string]interface{}{}
			bOk := true
			if strings.TrimSpace(bStr) != "" {
				bJsonMap, bOk = parseJSONObject(bStr)
			}
			if oOk && tOk && bOk {
				handledAsJSON = true
				mergedJSONObj, jsonConflicts := mergeNestedObject3Way("body.content", bJsonMap, oJsonMap, tJsonMap)
				conflicts = append(conflicts, jsonConflicts...)
				if formatted, err := json.MarshalIndent(mergedJSONObj, "", "  "); err == nil {
					merged["content"] = string(formatted)
				} else {
					merged["content"] = oStr
				}
			}
		}

		if !handledAsJSON {
			merged["content"] = oContent
			conflicts = append(conflicts, model.GitFieldConflict{
				FieldPath:   "body.content",
				Label:       friendlyFieldLabel("body.content"),
				BaseValue:   bContent,
				OursValue:   oContent,
				TheirsValue: tContent,
			})
		}
	}

	// 3. Merge body.form_data and body.urlencoded
	for _, kvField := range []struct {
		key   string
		label string
	}{
		{key: "form_data", label: "Body Form-Data"},
		{key: "urlencoded", label: "Body URL-Encoded"},
	} {
		var bList, oList, tList interface{}
		if baseBody != nil {
			bList = baseBody[kvField.key]
		}
		if oursBody != nil {
			oList = oursBody[kvField.key]
		}
		if theirsBody != nil {
			tList = theirsBody[kvField.key]
		}
		if bList == nil && oList == nil && tList == nil {
			continue
		}
		mergedList, kvConflicts := mergeKVPairList("body."+kvField.key, kvField.label, bList, oList, tList)
		if len(mergedList) > 0 || oList != nil || tList != nil {
			merged[kvField.key] = mergedList
		}
		conflicts = append(conflicts, kvConflicts...)
	}

	return merged, conflicts
}

// MergeJSONObjects performs a field-level 3-Way JSON Merge between baseObj, oursObj (Local), and theirsObj (Remote).
// Returns the merged JSON map (using Ours values as preview fallback for conflicted fields) and any unresolved field conflicts.
func MergeJSONObjects(relPath string, baseObj, oursObj, theirsObj map[string]interface{}) (map[string]interface{}, []model.GitFieldConflict) {
	if baseObj == nil {
		baseObj = map[string]interface{}{}
	}
	if oursObj == nil {
		oursObj = map[string]interface{}{}
	}
	if theirsObj == nil {
		theirsObj = map[string]interface{}{}
	}

	slashPath := filepath.ToSlash(strings.TrimSpace(relPath))
	isCollectionMeta := slashPath == collectionFileName

	keys := sortedUnionKeys(baseObj, oursObj, theirsObj)
	merged := make(map[string]interface{}, len(keys))
	var conflicts []model.GitFieldConflict

	for _, k := range keys {
		bVal, inB := baseObj[k]
		oVal, inO := oursObj[k]
		tVal, inT := theirsObj[k]

		// 1. Auto-resolve timestamps
		if k == "created_at" {
			if inO && oVal != nil {
				merged[k] = oVal
			} else if inT && tVal != nil {
				merged[k] = tVal
			} else if inB && bVal != nil {
				merged[k] = bVal
			}
			continue
		}
		if k == "updated_at" {
			merged[k] = time.Now().UTC().Format(time.RFC3339)
			continue
		}

		// 2. Auto-resolve collection-specific local identity fields
		if isCollectionMeta {
			if k == "id" || k == "is_default" || k == "is_active" {
				if inO {
					merged[k] = oVal
				} else if inT {
					merged[k] = tVal
				}
				continue
			}
			if k == "git_remote_url" {
				if oStr, ok := oVal.(string); ok && strings.TrimSpace(oStr) != "" {
					merged[k] = strings.TrimSpace(oStr)
				} else if tStr, ok := tVal.(string); ok && strings.TrimSpace(tStr) != "" {
					merged[k] = strings.TrimSpace(tStr)
				}
				continue
			}
			// When merging unrelated histories (empty base) for collection.json, auto-merge name and description
			if len(baseObj) == 0 {
				if k == "name" {
					oStr, _ := oVal.(string)
					tStr, _ := tVal.(string)
					if (oStr == "" || oStr == "Default Collection") && tStr != "" {
						merged[k] = tStr
					} else if oStr != "" {
						merged[k] = oStr
					} else {
						merged[k] = tStr
					}
					continue
				}
				if k == "description" {
					oStr, _ := oVal.(string)
					tStr, _ := tVal.(string)
					if oStr == "" && tStr != "" {
						merged[k] = tStr
					} else if oStr != "" && tStr == "" {
						merged[k] = oStr
					}
					if _, done := merged[k]; done {
						continue
					}
				}
			}
		}

		// 3. Top-level KVPair lists (headers, params, path_params, variables)
		if labelPrefix, isKV := topLevelKVPairFields[k]; isKV {
			mergedList, kvConflicts := mergeKVPairList(k, labelPrefix, bVal, oVal, tVal)
			if len(mergedList) > 0 || inO || inT {
				merged[k] = mergedList
			}
			conflicts = append(conflicts, kvConflicts...)
			continue
		}

		// 4. Environment KVPair map: folder_envs
		if k == "folder_envs" {
			bMap, _ := asMap(bVal)
			oMap, _ := asMap(oVal)
			tMap, _ := asMap(tVal)
			envIDs := sortedUnionKeys(bMap, oMap, tMap)
			mergedFolderEnvs := make(map[string]interface{}, len(envIDs))
			for _, envID := range envIDs {
				var bEnv, oEnv, tEnv interface{}
				if bMap != nil {
					bEnv = bMap[envID]
				}
				if oMap != nil {
					oEnv = oMap[envID]
				}
				if tMap != nil {
					tEnv = tMap[envID]
				}
				mergedEnvList, envConflicts := mergeKVPairList(
					"folder_envs."+envID,
					fmt.Sprintf("Folder Env (%s)", envID),
					bEnv, oEnv, tEnv,
				)
				if len(mergedEnvList) > 0 || (oMap != nil && oMap[envID] != nil) || (tMap != nil && tMap[envID] != nil) {
					mergedFolderEnvs[envID] = mergedEnvList
				}
				conflicts = append(conflicts, envConflicts...)
			}
			if len(mergedFolderEnvs) > 0 || inO || inT {
				merged[k] = mergedFolderEnvs
			}
			continue
		}

		// 5. Environment AuthConfig map: auth_envs
		if k == "auth_envs" {
			bMap, _ := asMap(bVal)
			oMap, _ := asMap(oVal)
			tMap, _ := asMap(tVal)
			mergedAuthEnvs, authEnvConflicts := mergeNestedObject3Way("auth_envs", bMap, oMap, tMap)
			if len(mergedAuthEnvs) > 0 || inO || inT {
				merged[k] = mergedAuthEnvs
			}
			conflicts = append(conflicts, authEnvConflicts...)
			continue
		}

		// 6. Structured body object
		if k == "body" {
			bBody, _ := asMap(bVal)
			oBody, oIsMap := asMap(oVal)
			tBody, tIsMap := asMap(tVal)
			if oIsMap || tIsMap {
				mergedBody, bodyConflicts := mergeBodyObject3Way(bBody, oBody, tBody)
				merged[k] = mergedBody
				conflicts = append(conflicts, bodyConflicts...)
				continue
			}
		}

		// 7. Nested structured objects (auth, scripts, etc.)
		bSub, bIsMap := asMap(bVal)
		oSub, oIsMap := asMap(oVal)
		tSub, tIsMap := asMap(tVal)
		if (oIsMap && tIsMap) || (oIsMap && !inT && bIsMap) || (tIsMap && !inO && bIsMap) {
			if !inO && inB && jsonEqual(tVal, bVal) {
				continue
			}
			if !inT && inB && jsonEqual(oVal, bVal) {
				continue
			}
			if oIsMap && tIsMap {
				subMerged, subConflicts := mergeNestedObject3Way(k, bSub, oSub, tSub)
				merged[k] = subMerged
				conflicts = append(conflicts, subConflicts...)
				continue
			}
		}

		// 8. Top-level scalar comparison
		if inO == inT && (!inO || jsonEqual(oVal, tVal)) {
			if inO {
				merged[k] = cloneJSONValue(oVal)
			}
			continue
		}
		if inO == inB && (!inO || jsonEqual(oVal, bVal)) {
			if inT {
				merged[k] = cloneJSONValue(tVal)
			}
			continue
		}
		if inT == inB && (!inT || jsonEqual(tVal, bVal)) {
			if inO {
				merged[k] = cloneJSONValue(oVal)
			}
			continue
		}

		// True field conflict
		if inO {
			merged[k] = cloneJSONValue(oVal)
		}
		conflicts = append(conflicts, model.GitFieldConflict{
			FieldPath:   k,
			Label:       friendlyFieldLabel(k),
			BaseValue:   cloneJSONValue(bVal),
			OursValue:   cloneJSONValue(oVal),
			TheirsValue: cloneJSONValue(tVal),
		})
	}

	return merged, conflicts
}

// buildFileConflict inspects a single conflicted file from Git index stages and executes 3-Way JSON Merge.
// Returns the GitFileConflict descriptor and a boolean indicating whether the file can be 100% auto-merged.
func (s *GitSyncService) buildFileConflict(collDir, relPath string, localColl *model.Collection, remoteURL string, isStashPop bool) (model.GitFileConflict, bool) {
	slashPath := filepath.ToSlash(strings.TrimSpace(relPath))
	baseRaw, baseExists, oursRaw, oursExists, theirsRaw, theirsExists := s.readConflictStages(collDir, slashPath, isStashPop)

	baseObj, _ := parseJSONObject(baseRaw)
	oursObj, oursValidJSON := parseJSONObject(oursRaw)
	theirsObj, theirsValidJSON := parseJSONObject(theirsRaw)

	entityType, entityName := detectEntityMeta(slashPath, baseObj, oursObj, theirsObj)

	// Delete vs. Edit conflicts
	if !oursExists && theirsExists {
		if theirsValidJSON {
			return model.GitFileConflict{
				FilePath:      slashPath,
				EntityType:    entityType,
				EntityName:    entityName,
				ConflictType:  "delete_edit",
				MergedPreview: cloneJSONMap(theirsObj),
				OursData:      nil,
				TheirsData:    theirsObj,
			}, false
		}
		return model.GitFileConflict{
			FilePath:     slashPath,
			EntityType:   "raw",
			EntityName:   entityName,
			ConflictType: "delete_edit",
			Fields: []model.GitFieldConflict{
				{
					FieldPath:   "__raw__",
					Label:       "Nội dung file",
					BaseValue:   baseRaw,
					OursValue:   nil,
					TheirsValue: theirsRaw,
				},
			},
		}, false
	}

	if oursExists && !theirsExists {
		if oursValidJSON {
			return model.GitFileConflict{
				FilePath:      slashPath,
				EntityType:    entityType,
				EntityName:    entityName,
				ConflictType:  "edit_delete",
				MergedPreview: cloneJSONMap(oursObj),
				OursData:      oursObj,
				TheirsData:    nil,
			}, false
		}
		return model.GitFileConflict{
			FilePath:     slashPath,
			EntityType:   "raw",
			EntityName:   entityName,
			ConflictType: "edit_delete",
			Fields: []model.GitFieldConflict{
				{
					FieldPath:   "__raw__",
					Label:       "Nội dung file",
					BaseValue:   baseRaw,
					OursValue:   oursRaw,
					TheirsValue: nil,
				},
			},
		}, false
	}

	// Non-JSON or malformed JSON file conflict
	if !strings.HasSuffix(strings.ToLower(slashPath), ".json") || !oursValidJSON || !theirsValidJSON {
		if oursExists && theirsExists && oursRaw == theirsRaw {
			return model.GitFileConflict{
				FilePath:     slashPath,
				EntityType:   "raw",
				EntityName:   entityName,
				ConflictType: "field_conflict",
			}, true
		}
		var bVal interface{}
		if baseExists {
			bVal = baseRaw
		}
		return model.GitFileConflict{
			FilePath:     slashPath,
			EntityType:   "raw",
			EntityName:   entityName,
			ConflictType: "field_conflict",
			Fields: []model.GitFieldConflict{
				{
					FieldPath:   "__raw__",
					Label:       "Nội dung file",
					BaseValue:   bVal,
					OursValue:   oursRaw,
					TheirsValue: theirsRaw,
				},
			},
		}, false
	}

	// Both Ours and Theirs are valid JSON objects -> execute 3-Way JSON Merge
	mergedObj, fieldConflicts := MergeJSONObjects(slashPath, baseObj, oursObj, theirsObj)

	if slashPath == collectionFileName && localColl != nil {
		mergedObj["id"] = localColl.ID
		mergedObj["is_default"] = localColl.IsDefault
		if strings.TrimSpace(remoteURL) != "" {
			mergedObj["git_remote_url"] = strings.TrimSpace(remoteURL)
		}
	}

	entityType, entityName = detectEntityMeta(slashPath, baseObj, mergedObj, theirsObj)

	return model.GitFileConflict{
		FilePath:      slashPath,
		EntityType:    entityType,
		EntityName:    entityName,
		ConflictType:  "field_conflict",
		Fields:        fieldConflicts,
		MergedPreview: mergedObj,
		OursData:      oursObj,
		TheirsData:    theirsObj,
	}, len(fieldConflicts) == 0
}

// processConflictsAndAutoMerge runs 3-Way JSON Auto-Merge on all conflicted files in collDir.
// Files with zero field conflicts are written to disk and staged via `git add`.
// If all files are auto-merged cleanly, completes the merge commit / stash pop and returns (nil, true).
func (s *GitSyncService) processConflictsAndAutoMerge(collDir, metaPath string, localColl *model.Collection, remoteURL string, isStashPop bool) ([]model.GitFileConflict, bool) {
	conflictFiles := s.getConflictFiles(collDir)
	if len(conflictFiles) == 0 {
		s.ensureCollectionMetaConsistent(metaPath, localColl, remoteURL)
		return nil, true
	}

	var unresolved []model.GitFileConflict
	for _, relPath := range conflictFiles {
		fileConflict, canAutoMerge := s.buildFileConflict(collDir, relPath, localColl, remoteURL, isStashPop)
		if canAutoMerge && fileConflict.ConflictType == "field_conflict" && len(fileConflict.Fields) == 0 {
			absPath := filepath.Join(collDir, filepath.FromSlash(fileConflict.FilePath))
			if fileConflict.EntityType == "raw" {
				_, _, oursRaw, oursExists, theirsRaw, _ := s.readConflictStages(collDir, fileConflict.FilePath, isStashPop)
				rawContent := oursRaw
				if !oursExists {
					rawContent = theirsRaw
				}
				if err := os.MkdirAll(filepath.Dir(absPath), 0755); err != nil {
					unresolved = append(unresolved, fileConflict)
					continue
				}
				if err := os.WriteFile(absPath, []byte(rawContent), 0644); err != nil {
					unresolved = append(unresolved, fileConflict)
					continue
				}
			} else if fileConflict.MergedPreview != nil {
				if err := s.fs.WriteJSON(absPath, fileConflict.MergedPreview); err != nil {
					unresolved = append(unresolved, fileConflict)
					continue
				}
			}
			if _, err := s.runGit(collDir, "add", "--", fileConflict.FilePath); err != nil {
				unresolved = append(unresolved, fileConflict)
				continue
			}
			s.removeStashConflictFileEntry(collDir, fileConflict.FilePath)
		} else {
			unresolved = append(unresolved, fileConflict)
		}
	}

	if len(unresolved) > 0 {
		s.ensureCollectionMetaConsistent(metaPath, localColl, remoteURL)
		return unresolved, false
	}

	remaining := s.getConflictFiles(collDir)
	if len(remaining) == 0 {
		s.ensureCollectionMetaConsistent(metaPath, localColl, remoteURL)
		if s.fs.Exists(metaPath) {
			_, _ = s.runGit(collDir, "add", "--", collectionFileName)
		}
		if s.fs.Exists(filepath.Join(collDir, ".git", "MERGE_HEAD")) {
			_, _ = s.runGit(collDir, "commit", "--no-edit", "-m", "chore(hecto): auto-merge collection json changes")
		}
		if s.isStashConflict(collDir) || isStashPop {
			s.clearStashConflictMarker(collDir)
			s.dropHectoStashIfPresent(collDir)
		}
		if s.fs != nil {
			_ = s.fs.IndexRebuild(collDir)
		}
		return nil, true
	}

	return unresolved, false
}

func (s *GitSyncService) ensureCollectionMetaConsistent(metaPath string, localColl *model.Collection, remoteURL string) {
	if localColl == nil || strings.TrimSpace(metaPath) == "" {
		return
	}
	trimmedRemote := strings.TrimSpace(remoteURL)
	var diskColl model.Collection
	if err := s.fs.ReadJSON(metaPath, &diskColl); err == nil {
		changed := false
		if diskColl.ID != localColl.ID {
			diskColl.ID = localColl.ID
			changed = true
		}
		if diskColl.IsDefault != localColl.IsDefault {
			diskColl.IsDefault = localColl.IsDefault
			changed = true
		}
		if trimmedRemote != "" && strings.TrimSpace(diskColl.GitRemoteURL) != trimmedRemote {
			diskColl.GitRemoteURL = trimmedRemote
			changed = true
		}
		if changed {
			_ = s.fs.WriteJSON(metaPath, diskColl)
		}
	} else if !s.fs.Exists(metaPath) {
		restored := *localColl
		if trimmedRemote != "" {
			restored.GitRemoteURL = trimmedRemote
		}
		_ = s.fs.WriteJSON(metaPath, restored)
	}
}

func validateConflictRelPath(collDir, relPath string) (string, string, error) {
	trimmed := strings.TrimSpace(relPath)
	if trimmed == "" || strings.HasPrefix(trimmed, "-") {
		return "", "", fmt.Errorf("đường dẫn file không hợp lệ: %s", relPath)
	}
	if filepath.IsAbs(trimmed) || strings.HasPrefix(trimmed, "/") || strings.HasPrefix(trimmed, "\\") {
		return "", "", fmt.Errorf("không chấp nhận đường dẫn tuyệt đối: %s", relPath)
	}
	slashPath := strings.ReplaceAll(trimmed, "\\", "/")
	parts := strings.Split(slashPath, "/")
	for _, p := range parts {
		if p == "" || p == "." || p == ".." || p == ".git" {
			return "", "", fmt.Errorf("đường dẫn file chứa thành phần không an toàn: %s", relPath)
		}
	}

	cleanRel := filepath.Clean(filepath.FromSlash(slashPath))
	if cleanRel == "." || cleanRel == ".." ||
		strings.HasPrefix(cleanRel, ".."+string(filepath.Separator)) ||
		cleanRel == ".git" ||
		strings.HasPrefix(cleanRel, ".git"+string(filepath.Separator)) {
		return "", "", fmt.Errorf("đường dẫn file nằm ngoài phạm vi cho phép: %s", relPath)
	}

	absCollDir, err := filepath.Abs(collDir)
	if err != nil {
		return "", "", err
	}
	absTarget, err := filepath.Abs(filepath.Join(absCollDir, cleanRel))
	if err != nil {
		return "", "", err
	}
	if !strings.HasPrefix(absTarget, absCollDir+string(filepath.Separator)) {
		return "", "", fmt.Errorf("đường dẫn file vượt ra ngoài thư mục collection: %s", relPath)
	}

	return filepath.ToSlash(cleanRel), absTarget, nil
}

// ResolveConflict writes user-resolved conflict files to disk, stages them in Git,
// commits the completed merge (or stash resolution), and rebuilds the collection index.
func (s *GitSyncService) ResolveConflict(collectionsRoot, collectionID string, resolvedFiles map[string]interface{}) model.Result {
	s.logger.Info("GitSyncService.ResolveConflict called", "collectionID", collectionID, "fileCount", len(resolvedFiles))

	collDir, metaPath, coll, errRes := s.validateCollectionDir(collectionsRoot, collectionID)
	if errRes != nil {
		return *errRes
	}

	if len(resolvedFiles) == 0 {
		return model.NewError(model.ErrValidation, "Danh sách file giải quyết xung đột không được để trống")
	}

	type validatedEntry struct {
		cleanRel string
		absPath  string
		value    interface{}
	}
	entries := make([]validatedEntry, 0, len(resolvedFiles))

	// Pre-validate all file paths before touching the filesystem
	for rawPath, val := range resolvedFiles {
		cleanRel, absPath, err := validateConflictRelPath(collDir, rawPath)
		if err != nil {
			return model.NewError(model.ErrValidation, err.Error())
		}
		entries = append(entries, validatedEntry{
			cleanRel: cleanRel,
			absPath:  absPath,
			value:    val,
		})
	}

	for _, entry := range entries {
		isDelete := entry.value == nil
		if m, ok := entry.value.(map[string]interface{}); ok {
			if delFlag, hasDel := m["__deleted__"].(bool); hasDel && delFlag {
				isDelete = true
			}
		}

		if isDelete {
			_ = os.Remove(entry.absPath)
			if out, err := s.runGit(collDir, "rm", "-f", "--ignore-unmatch", "--", entry.cleanRel); err != nil {
				return model.NewError(model.ErrGitError, fmt.Sprintf("Không thể xóa file xung đột %s: %s", entry.cleanRel, out))
			}
			s.removeStashConflictFileEntry(collDir, entry.cleanRel)
			continue
		}

		if objMap, ok := entry.value.(map[string]interface{}); ok {
			toWrite := cloneJSONMap(objMap)
			if toWrite == nil {
				toWrite = map[string]interface{}{}
			}
			if _, hasUpdated := toWrite["updated_at"]; hasUpdated {
				toWrite["updated_at"] = time.Now().UTC().Format(time.RFC3339)
			}
			if entry.cleanRel == collectionFileName {
				toWrite["id"] = coll.ID
				toWrite["is_default"] = coll.IsDefault
				if strings.TrimSpace(coll.GitRemoteURL) != "" {
					toWrite["git_remote_url"] = strings.TrimSpace(coll.GitRemoteURL)
				}
			}
			if err := s.fs.WriteJSON(entry.absPath, toWrite); err != nil {
				return model.NewError(model.ErrIO, fmt.Sprintf("Không thể ghi file JSON %s: %v", entry.cleanRel, err))
			}
		} else if rawStr, ok := entry.value.(string); ok {
			if err := os.MkdirAll(filepath.Dir(entry.absPath), 0755); err != nil {
				return model.NewError(model.ErrIO, fmt.Sprintf("Không thể tạo thư mục cho %s: %v", entry.cleanRel, err))
			}
			if err := os.WriteFile(entry.absPath, []byte(rawStr), 0644); err != nil {
				return model.NewError(model.ErrIO, fmt.Sprintf("Không thể ghi file %s: %v", entry.cleanRel, err))
			}
		} else {
			if err := s.fs.WriteJSON(entry.absPath, entry.value); err != nil {
				return model.NewError(model.ErrIO, fmt.Sprintf("Không thể ghi file %s: %v", entry.cleanRel, err))
			}
		}

		if out, err := s.runGit(collDir, "add", "--", entry.cleanRel); err != nil {
			return model.NewError(model.ErrGitError, fmt.Sprintf("Không thể git add file %s: %s", entry.cleanRel, out))
		}
		s.removeStashConflictFileEntry(collDir, entry.cleanRel)
	}

	remaining := s.getConflictFiles(collDir)
	if len(remaining) == 0 {
		s.ensureCollectionMetaConsistent(metaPath, coll, coll.GitRemoteURL)
		if s.fs.Exists(metaPath) {
			_, _ = s.runGit(collDir, "add", "--", collectionFileName)
		}
		if s.fs.Exists(filepath.Join(collDir, ".git", "MERGE_HEAD")) {
			_, _ = s.runGit(collDir, "commit", "--no-edit", "-m", "chore(hecto): resolve git conflicts")
			if s.hasHectoStash(collDir) {
				_, _ = s.runGit(collDir, "stash", "pop")
			}
		} else if s.isStashConflict(collDir) {
			s.clearStashConflictMarker(collDir)
			s.dropHectoStashIfPresent(collDir)
			_, _ = s.runGit(collDir, "add", "-A")
			_, _ = s.runGit(collDir, "commit", "--no-edit", "-m", "chore(hecto): resolve git stash conflicts")
		}
		if s.fs != nil {
			_ = s.fs.IndexRebuild(collDir)
		}
		status := s.inspectStatus(collDir, coll.GitRemoteURL)
		return model.NewSuccess(status)
	}

	status := s.inspectStatus(collDir, coll.GitRemoteURL)
	return model.Result{
		Success: false,
		Data:    status,
		Error: &model.AppError{
			Code:    model.ErrGitConflict,
			Message: fmt.Sprintf("Vẫn còn xung đột Git chưa được giải quyết tại: %s", strings.Join(remaining, ", ")),
		},
	}
}

// AbortMerge aborts an ongoing Git merge or StashAndPull conflict, restoring the collection to its safe state before Pull.
func (s *GitSyncService) AbortMerge(collectionsRoot, collectionID string) model.Result {
	s.logger.Info("GitSyncService.AbortMerge called", "collectionID", collectionID)

	collDir, metaPath, coll, errRes := s.validateCollectionDir(collectionsRoot, collectionID)
	if errRes != nil {
		return *errRes
	}

	if s.fs.Exists(filepath.Join(collDir, ".git", "MERGE_HEAD")) {
		if _, err := s.runGit(collDir, "merge", "--abort"); err != nil {
			_, _ = s.runGit(collDir, "reset", "--merge")
		}
		if s.hasHectoStash(collDir) {
			_, _ = s.runGit(collDir, "stash", "pop")
		}
	} else if s.isStashConflict(collDir) {
		prePullHead, _ := s.readStashConflictMarker(collDir)
		s.clearStashConflictMarker(collDir)
		if prePullHead != "" {
			_, _ = s.runGit(collDir, "reset", "--hard", prePullHead)
		} else {
			_, _ = s.runGit(collDir, "reset", "--hard", "HEAD")
		}
		_, _ = s.runGit(collDir, "clean", "-fd")
		if s.hasHectoStash(collDir) {
			_, _ = s.runGit(collDir, "stash", "pop")
		}
	} else if len(s.getConflictFiles(collDir)) > 0 {
		_, _ = s.runGit(collDir, "reset", "--merge")
	}

	s.ensureCollectionMetaConsistent(metaPath, coll, coll.GitRemoteURL)
	if s.fs != nil {
		_ = s.fs.IndexRebuild(collDir)
	}

	status := s.inspectStatus(collDir, coll.GitRemoteURL)
	return model.NewSuccess(status)
}
