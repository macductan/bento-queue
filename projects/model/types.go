package model

import "time"

// Error code constants (AD-3)
const (
	ErrNotFound    = "NOT_FOUND"
	ErrValidation  = "VALIDATION"
	ErrIO          = "IO_ERROR"
	ErrParse       = "PARSE_ERROR"
	ErrConnection  = "CONNECTION_ERROR"
	ErrTimeout     = "TIMEOUT"
	ErrAborted     = "ABORTED"
	ErrGitConflict = "GIT_CONFLICT"
	ErrGitError    = "GIT_ERROR"
)

// AppError represents a structured error with code and message (AD-3).
type AppError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// Result is the unified return type for all Wails bindings (AD-3).
// Data carries the payload on success; Error carries the structured error on failure.
type Result struct {
	Success bool        `json:"success"`
	Data    interface{} `json:"data,omitempty"`
	Error   *AppError   `json:"error,omitempty"`
}

// NewSuccess creates a successful Result with the given data.
func NewSuccess(data interface{}) Result {
	return Result{Success: true, Data: data}
}

// NewError creates a failed Result with the given error code and message.
func NewError(code, message string) Result {
	return Result{Success: false, Error: &AppError{Code: code, Message: message}}
}

// KVPair represents a key-value pair used in headers and query parameters.
type KVPair struct {
	Key         string `json:"key"`
	Value       string `json:"value"`
	Enabled     bool   `json:"enabled"`
	Description string `json:"description,omitempty"`
}

// Body represents the request body with a type selector (none, json, text, xml, urlencoded, formdata).
type Body struct {
	Type       string   `json:"type"` // "none", "json", "text", "xml", "urlencoded", "formdata"
	Content    string   `json:"content"`
	FormData   []KVPair `json:"form_data,omitempty"`
	URLEncoded []KVPair `json:"urlencoded,omitempty"`
}

// BearerAuth stores Bearer token auth configuration.
type BearerAuth struct {
	Token string `json:"token"`
}

// BasicAuth stores Basic authentication credentials.
type BasicAuth struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

// APIKeyAuth stores API Key configuration (header or query parameter).
type APIKeyAuth struct {
	Key   string `json:"key"`
	Value string `json:"value"`
	AddTo string `json:"addTo"` // "header" or "query"
}

// AuthConfig represents authentication settings for a Request or Folder.
type AuthConfig struct {
	Type   string      `json:"type"`             // "inherit", "none", "bearer", "basic", "apiKey"
	Bearer *BearerAuth `json:"bearer,omitempty"`
	Basic  *BasicAuth  `json:"basic,omitempty"`
	APIKey *APIKeyAuth `json:"apiKey,omitempty"`
}

// Scripts stores pre-request and post-response JavaScript snippets for a Request.
type Scripts struct {
	PreRequest   string `json:"pre_request,omitempty"`
	PostResponse string `json:"post_response,omitempty"`
}

// Request represents an API request entity stored as a JSON file on disk.
// Identity is UUID v4, stored as <uuid>.json on disk.
type Request struct {
	ID         string                 `json:"id"`
	Name       string                 `json:"name"`
	Method     string                 `json:"method"`
	URL        string                 `json:"url"`
	Headers    []KVPair               `json:"headers"`
	Params     []KVPair               `json:"params"`
	PathParams []KVPair               `json:"path_params,omitempty"`
	Body       Body                   `json:"body"`
	Auth       *AuthConfig            `json:"auth,omitempty"`
	AuthEnvs   map[string]*AuthConfig `json:"auth_envs,omitempty"`
	Scripts    *Scripts               `json:"scripts,omitempty"`
	CreatedAt  time.Time              `json:"created_at"`
	UpdatedAt  time.Time              `json:"updated_at"`
}

// TreeNode represents a node in the collection tree (folder or request) (Story 2.1).
type TreeNode struct {
	ID         string                 `json:"id"`
	Name       string                 `json:"name"`
	Type       string                 `json:"type"` // "folder" or "request"
	Method     string                 `json:"method,omitempty"`
	Path       string                 `json:"path"`
	Children   []TreeNode             `json:"children,omitempty"`
	Variables  []KVPair               `json:"variables,omitempty"`
	FolderEnvs map[string][]KVPair    `json:"folder_envs,omitempty"`
	Headers    []KVPair               `json:"headers,omitempty"`
	Auth       *AuthConfig            `json:"auth,omitempty"`
	AuthEnvs   map[string]*AuthConfig `json:"auth_envs,omitempty"`
	CreatedAt  time.Time              `json:"created_at"`
}

// Folder represents a folder in the collection tree.
// Stored as _folder.json on disk.
type Folder struct {
	ID         string                 `json:"id"`
	Name       string                 `json:"name"`
	Variables  []KVPair               `json:"variables"`
	FolderEnvs map[string][]KVPair    `json:"folder_envs,omitempty"`
	Headers    []KVPair               `json:"headers"`
	Auth       *AuthConfig            `json:"auth,omitempty"`
	AuthEnvs   map[string]*AuthConfig `json:"auth_envs,omitempty"`
	CreatedAt  time.Time              `json:"created_at"`
	UpdatedAt  time.Time              `json:"updated_at"`
}

// Environment represents a set of key-value variables for variable substitution.
// Stored as a JSON file in the environments/ directory.
type Environment struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Variables []KVPair  `json:"variables"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// Collection represents the root collection metadata.
// Stored as collection.json at the collection root.
type Collection struct {
	ID           string                 `json:"id,omitempty"`
	Name         string                 `json:"name"`
	Description  string                 `json:"description"`
	Variables    []KVPair               `json:"variables,omitempty"`
	Auth         *AuthConfig            `json:"auth,omitempty"`
	AuthEnvs     map[string]*AuthConfig `json:"auth_envs,omitempty"`
	ActiveEnvID  string                 `json:"active_env_id,omitempty"`
	GitRemoteURL string                 `json:"git_remote_url,omitempty"`
	IsDefault    bool                   `json:"is_default,omitempty"`
	IsActive     bool                   `json:"is_active,omitempty"`
	CreatedAt    time.Time              `json:"created_at"`
	UpdatedAt    time.Time              `json:"updated_at"`
}

// GitSyncStatus represents the current Git synchronization status for a collection.
type GitSyncStatus struct {
	HasGitRepo    bool     `json:"has_git_repo"`
	RemoteURL     string   `json:"remote_url"`
	Branch        string   `json:"branch"`
	HasChanges    bool     `json:"has_changes"`
	HasConflicts  bool     `json:"has_conflicts"`
	ConflictFiles []string `json:"conflict_files,omitempty"`
	Output        string   `json:"output,omitempty"`
}

// ExecuteRequest is the data sent from Vue to Go for HTTP execution (AD-1).
// All variables are already resolved by Vue before sending.
type ExecuteRequest struct {
	Method   string   `json:"method"`
	URL      string   `json:"url"`
	Headers  []KVPair `json:"headers"`
	Body     string   `json:"body"`
	BodyType string   `json:"body_type,omitempty"`
	FormData []KVPair `json:"form_data,omitempty"`
}

// ExecuteResponse is the data returned from Go to Vue after HTTP execution.
type ExecuteResponse struct {
	StatusCode int                 `json:"status_code"`
	StatusText string              `json:"status_text"`
	Headers    map[string][]string `json:"headers"`
	Body       string              `json:"body"`
	TimeMs     int                 `json:"time_ms"`
	SizeBytes  int                 `json:"size_bytes"`
	Timestamp  string              `json:"timestamp"`
	Truncated  bool                `json:"truncated"`
	IsBinary   bool                `json:"is_binary"`
}

// ExecutionHistoryEntry records a single API execution in collection history.
type ExecutionHistoryEntry struct {
	ID           string           `json:"id"`
	CollectionID string           `json:"collection_id"`
	RequestID    string           `json:"request_id,omitempty"`
	RequestName  string           `json:"request_name"`
	Method       string           `json:"method"`
	URL          string           `json:"url"`
	StatusCode   int              `json:"status_code"`
	StatusText   string           `json:"status_text"`
	TimeMs       int64            `json:"time_ms"`
	SizeBytes    int64            `json:"size_bytes"`
	Timestamp    string           `json:"timestamp"`
	Request      ExecuteRequest   `json:"request"`
	Response     *ExecuteResponse `json:"response,omitempty"`
	Error        string           `json:"error,omitempty"`
}

// ChangelogEntry records a modification event in a collection.
type ChangelogEntry struct {
	ID           string    `json:"id"`
	CollectionID string    `json:"collection_id"`
	EntityType   string    `json:"entity_type"` // "request", "folder", "collection", "environment"
	EntityID     string    `json:"entity_id"`
	EntityName   string    `json:"entity_name"`
	Action       string    `json:"action"` // "create", "update", "rename", "delete", "duplicate"
	Summary      string    `json:"summary"`
	Timestamp    time.Time `json:"timestamp"`
}

// MockRoute represents a single route configured on the local Mock HTTP Server.
type MockRoute struct {
	ID          string   `json:"id"`
	Method      string   `json:"method"`
	Path        string   `json:"path"`
	StatusCode  int      `json:"status_code"`
	Headers     []KVPair `json:"headers"`
	Body        string   `json:"body"`
	DelayMs     int64    `json:"delay_ms,omitempty"`
	Enabled     bool     `json:"enabled"`
	Description string   `json:"description,omitempty"`
}

// MockServerConfig stores port and route definitions for a collection's local Mock HTTP Server.
type MockServerConfig struct {
	Port   int         `json:"port"`
	Routes []MockRoute `json:"routes"`
}

// MockServerStatus represents the live status of the local Mock HTTP Server.
type MockServerStatus struct {
	Running bool        `json:"running"`
	Port    int         `json:"port"`
	BaseURL string      `json:"base_url"`
	Routes  []MockRoute `json:"routes"`
}
