package model

import "time"

// AppConfig chứa cấu hình ứng dụng, lưu tại {os.UserConfigDir()}/hecto-api/config.json.
type AppConfig struct {
	CollectionRoot string    `json:"collection_root"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}
