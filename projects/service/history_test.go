package service

import (
	"fmt"
	"log/slog"
	"testing"

	"hecto-api/model"
	"hecto-api/storage"
)

func TestHistoryService_Executions(t *testing.T) {
	collRoot := t.TempDir()
	fs := storage.NewFileSystem()
	svc := NewHistoryService(fs, slog.Default())

	// Initially empty
	res := svc.ListExecutions(collRoot)
	if !res.Success {
		t.Fatalf("expected success, got error: %+v", res.Error)
	}
	list := res.Data.([]model.ExecutionHistoryEntry)
	if len(list) != 0 {
		t.Fatalf("expected 0 entries, got %d", len(list))
	}

	// Record 105 entries to test FIFO rotation at maxExecutionEntries (100)
	for i := 1; i <= 105; i++ {
		recRes := svc.RecordExecution(collRoot, model.ExecutionHistoryEntry{
			CollectionID: "test-coll",
			RequestID:    fmt.Sprintf("req-%d", i),
			RequestName:  fmt.Sprintf("Request %d", i),
			Request: model.ExecuteRequest{
				Method: "GET",
				URL:    fmt.Sprintf("https://api.example.com/items/%d", i),
			},
			Response: &model.ExecuteResponse{
				StatusCode: 200,
				StatusText: "200 OK",
				TimeMs:     12,
				SizeBytes:  64,
			},
		})
		if !recRes.Success {
			t.Fatalf("RecordExecution failed at %d: %+v", i, recRes.Error)
		}
	}

	res = svc.ListExecutions(collRoot)
	list = res.Data.([]model.ExecutionHistoryEntry)
	if len(list) != maxExecutionEntries {
		t.Fatalf("expected %d entries, got %d", maxExecutionEntries, len(list))
	}
	// Newest entry (105) should be first
	if list[0].RequestID != "req-105" {
		t.Errorf("expected newest entry req-105 first, got %s", list[0].RequestID)
	}
	if list[0].StatusCode != 200 || list[0].Method != "GET" {
		t.Errorf("expected auto-populated StatusCode=200 and Method=GET, got %d %s", list[0].StatusCode, list[0].Method)
	}

	// Clear executions
	clearRes := svc.ClearExecutions(collRoot)
	if !clearRes.Success {
		t.Fatalf("ClearExecutions failed: %+v", clearRes.Error)
	}
	res = svc.ListExecutions(collRoot)
	list = res.Data.([]model.ExecutionHistoryEntry)
	if len(list) != 0 {
		t.Fatalf("expected 0 entries after clear, got %d", len(list))
	}
}

func TestHistoryService_Changelog(t *testing.T) {
	collRoot := t.TempDir()
	fs := storage.NewFileSystem()
	svc := NewHistoryService(fs, slog.Default())

	for i := 1; i <= 205; i++ {
		recRes := svc.RecordChangelog(collRoot, model.ChangelogEntry{
			CollectionID: "test-coll",
			EntityType:   "request",
			EntityID:     fmt.Sprintf("req-%d", i),
			EntityName:   fmt.Sprintf("Get Users %d", i),
			Action:       "update",
			Summary:      fmt.Sprintf("Cập nhật request Get Users %d", i),
		})
		if !recRes.Success {
			t.Fatalf("RecordChangelog failed at %d: %+v", i, recRes.Error)
		}
	}

	res := svc.ListChangelog(collRoot)
	if !res.Success {
		t.Fatalf("ListChangelog failed: %+v", res.Error)
	}
	list := res.Data.([]model.ChangelogEntry)
	if len(list) != maxChangelogEntries {
		t.Fatalf("expected %d entries, got %d", maxChangelogEntries, len(list))
	}
	if list[0].EntityID != "req-205" {
		t.Errorf("expected newest changelog req-205 first, got %s", list[0].EntityID)
	}

	clearRes := svc.ClearChangelog(collRoot)
	if !clearRes.Success {
		t.Fatalf("ClearChangelog failed: %+v", clearRes.Error)
	}
	res = svc.ListChangelog(collRoot)
	list = res.Data.([]model.ChangelogEntry)
	if len(list) != 0 {
		t.Fatalf("expected 0 changelog entries after clear, got %d", len(list))
	}
}
