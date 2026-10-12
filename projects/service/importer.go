package service

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"

	"hecto-api/model"
	"hecto-api/slug"
	"hecto-api/storage"
)

// ImporterService handles importing Postman v2.1 collections.
type ImporterService struct {
	fs     *storage.FileSystem
	logger *slog.Logger
}

// NewImporterService creates a new ImporterService.
func NewImporterService(fs *storage.FileSystem, logger *slog.Logger) *ImporterService {
	return &ImporterService{fs: fs, logger: logger}
}

type postmanInfo struct {
	Name   string `json:"name"`
	Schema string `json:"schema"`
}

type postmanHeader struct {
	Key      string `json:"key"`
	Value    string `json:"value"`
	Disabled bool   `json:"disabled,omitempty"`
}

type postmanBody struct {
	Mode string `json:"mode"`
	Raw  string `json:"raw"`
}

type postmanAuthParam struct {
	Key   string      `json:"key"`
	Value interface{} `json:"value"`
	Type  string      `json:"type"`
}

type postmanAuth struct {
	Type   string             `json:"type"`
	Bearer []postmanAuthParam `json:"bearer,omitempty"`
	Basic  []postmanAuthParam `json:"basic,omitempty"`
}

type postmanVariable struct {
	Key   string `json:"key"`
	Value string `json:"value"`
	Type  string `json:"type,omitempty"`
}

type postmanRequest struct {
	Method string          `json:"method"`
	URL    interface{}     `json:"url"`
	Header []postmanHeader `json:"header,omitempty"`
	Body   *postmanBody    `json:"body,omitempty"`
	Auth   *postmanAuth    `json:"auth,omitempty"`
}

type postmanItem struct {
	Name    string          `json:"name"`
	Item    []postmanItem   `json:"item,omitempty"`
	Request *postmanRequest `json:"request,omitempty"`
	Auth    *postmanAuth    `json:"auth,omitempty"`
	Variable []postmanVariable `json:"variable,omitempty"`
}

type postmanCollection struct {
	Info postmanInfo   `json:"info"`
	Item []postmanItem `json:"item"`
	Auth *postmanAuth  `json:"auth,omitempty"`
	Variable []postmanVariable `json:"variable,omitempty"`
}

// ImportPostman parses a Postman v2.1 collection JSON file and converts it
// to the internal format.
func countTotalItems(items []postmanItem) int {
	total := 0
	for _, item := range items {
		total++ // Count this item (folder or request)
		if len(item.Item) > 0 {
			total += countTotalItems(item.Item)
		}
	}
	return total
}

func (s *ImporterService) ImportPostman(rootPath, filePath string, onProgress func(count int, total int, text string)) model.Result {
	s.logger.Info("ImportPostman called", "file", filePath)

	data, err := os.ReadFile(filePath)
	if err != nil {
		s.logger.Error("Failed to read postman collection file", "error", err)
		return model.NewError(model.ErrIO, fmt.Sprintf(ErrFileReadFailed, err))
	}

	var coll postmanCollection
	if err := json.Unmarshal(data, &coll); err != nil {
		s.logger.Error("Failed to parse postman collection JSON", "error", err)
		return model.NewError(model.ErrParse, fmt.Sprintf(ErrJSONInvalid, err))
	}

	if coll.Info.Schema == "" || !strings.Contains(coll.Info.Schema, "v2.1.0") {
		return model.NewError(model.ErrValidation, ErrPostmanVersionInvalid)
	}

	count := 0
	var firstReqID string

	// Wrap the entire collection in a folder so it doesn't spread out in the root
	collName := coll.Info.Name
	if collName == "" {
		collName = "Imported Collection"
	}
	
	rootItem := postmanItem{
		Name:     collName,
		Item:     coll.Item,
		Auth:     coll.Auth,
		Variable: coll.Variable,
	}
	
	
	totalItems := countTotalItems(rootItem.Item)
	if rootItem.Request != nil || len(rootItem.Item) > 0 {
		totalItems++
	}
	if totalItems == 0 {
		totalItems = 1 // Prevent div by zero
	}
	processedCount := 0
	
	onItemProcessed := func(itemName string) {
		processedCount++
		if onProgress != nil {
			onProgress(processedCount, totalItems, fmt.Sprintf("Đang import %s...", itemName))
		}
	}

	c, fID := s.processItem(rootPath, rootItem, nil, onItemProcessed)
	if c > 0 {
		count += c
		firstReqID = fID
	}

	return model.NewSuccess(map[string]interface{}{
		"count": count,
		"firstRequestId": firstReqID,
	})
}

func (s *ImporterService) processItem(currentDir string, item postmanItem, inheritedAuth *postmanAuth, onProcessed func(string)) (int, string) {
	if item.Request == nil && len(item.Item) == 0 {
		// Malformed item
		s.logger.Warn("Skipping malformed postman item", "name", item.Name)
		return 0, ""
	}

	currentAuth := inheritedAuth
	if item.Auth != nil {
		currentAuth = item.Auth
	}

	count := 0
	var firstReqID string
	nextDir := currentDir

	if len(item.Item) > 0 {
		// It's a folder
		folderID := uuid.New().String()
		dirSlug := slug.EntityDir(item.Name, folderID)
		folderPath := filepath.Join(currentDir, dirSlug)

		if err := s.fs.MakeDir(folderPath); err != nil {
			s.logger.Error("Failed to create folder directory", "path", folderPath, "error", err)
			if onProcessed != nil {
				onProcessed(item.Name)
			}
			return count, firstReqID
		}
		
		vars := []model.KVPair{}
		for _, v := range item.Variable {
			vars = append(vars, model.KVPair{
				Key:     v.Key,
				Value:   v.Value,
				Enabled: true,
			})
		}
		
		folderMeta := model.Folder{
			ID:        folderID,
			Name:      item.Name,
			Variables: vars,
			Headers:   []model.KVPair{},
			CreatedAt: time.Now(),
			UpdatedAt: time.Now(),
		}

		metaPath := filepath.Join(folderPath, "_folder.json")
		if err := s.fs.WriteJSON(metaPath, folderMeta); err != nil {
			s.logger.Error("Failed to write folder meta", "path", metaPath, "error", err)
		} else {
			s.fs.IndexSet(folderID, folderPath)
			count++
		}
		if onProcessed != nil {
			onProcessed(item.Name)
		}
		
		nextDir = folderPath
	}
	
	if item.Request != nil {
		// It's a request
		reqID := uuid.New().String()
		fileSlug := slug.EntityFilename(item.Name, reqID)
		reqPath := filepath.Join(nextDir, fileSlug)

		now := time.Now()

		urlStr := ""
		params := []model.KVPair{}
		switch u := item.Request.URL.(type) {
		case string:
			urlStr = u
		case map[string]interface{}:
			if raw, ok := u["raw"].(string); ok && raw != "" {
				urlStr = raw
			} else {
				// build url from host and path
				var hostStr, pathStr string
				if hostIfc, ok := u["host"].([]interface{}); ok {
					var hostParts []string
					for _, h := range hostIfc {
						if hs, ok := h.(string); ok {
							hostParts = append(hostParts, hs)
						}
					}
					hostStr = strings.Join(hostParts, ".")
				}
				if pathIfc, ok := u["path"].([]interface{}); ok {
					var pathParts []string
					for _, p := range pathIfc {
						if ps, ok := p.(string); ok {
							pathParts = append(pathParts, ps)
						}
					}
					pathStr = strings.Join(pathParts, "/")
				}
				if hostStr != "" || pathStr != "" {
					urlStr = hostStr
					if pathStr != "" {
						urlStr += "/" + pathStr
					}
					if proto, ok := u["protocol"].(string); ok && proto != "" {
						urlStr = proto + "://" + urlStr
					}
				}
			}

			if queryIfc, ok := u["query"].([]interface{}); ok {
				for _, q := range queryIfc {
					if qMap, ok := q.(map[string]interface{}); ok {
						key, _ := qMap["key"].(string)
						val, _ := qMap["value"].(string)
						disabled, _ := qMap["disabled"].(bool)
						params = append(params, model.KVPair{
							Key:     key,
							Value:   val,
							Enabled: !disabled,
						})
					}
				}
			}
		}

		hasAuthHeader := false
		headers := make([]model.KVPair, 0, len(item.Request.Header))
		for _, h := range item.Request.Header {
			if strings.EqualFold(h.Key, "Authorization") {
				hasAuthHeader = true
			}
			headers = append(headers, model.KVPair{
				Key:     h.Key,
				Value:   h.Value,
				Enabled: !h.Disabled,
			})
		}

		reqAuth := item.Request.Auth
		if reqAuth == nil && currentAuth != nil {
			reqAuth = currentAuth
		}

		if reqAuth != nil && !hasAuthHeader {
			switch reqAuth.Type {
			case "bearer":
				for _, p := range reqAuth.Bearer {
					if p.Key == "token" {
						if val, ok := p.Value.(string); ok {
							headers = append(headers, model.KVPair{Key: "Authorization", Value: "Bearer " + val, Enabled: true})
						}
					}
				}
			case "basic":
				var user, pass string
				for _, p := range reqAuth.Basic {
					if p.Key == "username" {
						user, _ = p.Value.(string)
					}
					if p.Key == "password" {
						pass, _ = p.Value.(string)
					}
				}
				if user != "" || pass != "" {
					encoded := base64.StdEncoding.EncodeToString([]byte(user + ":" + pass))
					headers = append(headers, model.KVPair{Key: "Authorization", Value: "Basic " + encoded, Enabled: true})
				}
			}
		}

		body := model.Body{Type: "none", Content: ""}
		if item.Request.Body != nil {
			if item.Request.Body.Mode == "raw" || (item.Request.Body.Mode == "" && item.Request.Body.Raw != "") {
				body.Type = "raw"
				body.Content = item.Request.Body.Raw
			} else if item.Request.Body.Mode != "" {
				s.logger.Warn("Unsupported postman body mode converted to raw", "mode", item.Request.Body.Mode)
				body.Type = "raw"
				body.Content = "" 
			}
		}

		reqMeta := model.Request{
			ID:        reqID,
			Name:      item.Name,
			Method:    item.Request.Method,
			URL:       urlStr,
			Headers:   headers,
			Params:    params,
			Body:      body,
			CreatedAt: now,
			UpdatedAt: now,
		}

		if err := s.fs.WriteJSON(reqPath, reqMeta); err != nil {
			s.logger.Error("Failed to write request", "path", reqPath, "error", err)
		} else {
			s.fs.IndexSet(reqID, reqPath)
			count++
			if firstReqID == "" {
				firstReqID = reqID
			}
		}
		if onProcessed != nil {
			onProcessed(item.Name)
		}
	}

	if len(item.Item) > 0 {
		// Process children
		for _, child := range item.Item {
			c, fID := s.processItem(nextDir, child, currentAuth, onProcessed)
			count += c
			if firstReqID == "" && fID != "" {
				firstReqID = fID
			}
		}
	}

	return count, firstReqID
}
