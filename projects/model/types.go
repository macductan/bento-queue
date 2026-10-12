package model

import "time"

// Error code constants (AD-3)
const (
	ErrNotFound   = "NOT_FOUND"
	ErrValidation = "VALIDATION"
	ErrIO         = "IO_ERROR"
	ErrParse      = "PARSE_ERROR"
	ErrConnection = "CONNECTION_ERROR"
	ErrTimeout    = "TIMEOUT"
	ErrAborted    = "ABORTED"
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
	Key     string `json:"key"`
	Value   string `json:"value"`
	Enabled bool   `json:"enabled"`
}

// Body represents the request body with a type selector (none, json, text).
type Body struct {
	Type    string `json:"type"` // "none", "json", "text"
	Content string `json:"content"`
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

// Request represents an API request entity stored as a JSON file on disk.
// Identity is UUID v4, filename is slug (AD-4).
type Request struct {
	ID        string      `json:"id"`
	Name      string      `json:"name"`
	Method    string      `json:"method"`
	URL       string      `json:"url"`
	Headers   []KVPair    `json:"headers"`
	Params    []KVPair    `json:"params"`
	Body      Body        `json:"body"`
	Auth      *AuthConfig `json:"auth,omitempty"`
	CreatedAt time.Time   `json:"created_at"`
	UpdatedAt time.Time   `json:"updated_at"`
}

// TreeNode represents a node in the collection tree (folder or request) (Story 2.1).
type TreeNode struct {
	ID        string      `json:"id"`
	Name      string      `json:"name"`
	Type      string      `json:"type"` // "folder" or "request"
	Method    string      `json:"method,omitempty"`
	Path      string      `json:"path"`
	Children  []TreeNode  `json:"children,omitempty"`
	Variables []KVPair    `json:"variables,omitempty"`
	Headers   []KVPair    `json:"headers,omitempty"`
	Auth      *AuthConfig `json:"auth,omitempty"`
	CreatedAt time.Time   `json:"created_at"`
}

// Folder represents a folder in the collection tree.
// Stored as _folder.json on disk.
type Folder struct {
	ID        string      `json:"id"`
	Name      string      `json:"name"`
	Variables []KVPair    `json:"variables"`
	Headers   []KVPair    `json:"headers"`
	Auth      *AuthConfig `json:"auth,omitempty"`
	CreatedAt time.Time   `json:"created_at"`
	UpdatedAt time.Time   `json:"updated_at"`
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
	ID          string    `json:"id,omitempty"`
	Slug        string    `json:"slug"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	IsDefault   bool      `json:"is_default,omitempty"`
	IsActive    bool      `json:"is_active,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// ExecuteRequest is the data sent from Vue to Go for HTTP execution (AD-1).
// All variables are already resolved by Vue before sending.
type ExecuteRequest struct {
	Method  string   `json:"method"`
	URL     string   `json:"url"`
	Headers []KVPair `json:"headers"`
	Body    string   `json:"body"`
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
