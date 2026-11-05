package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"hecto-api/model"
)

func TestApp_startup(t *testing.T) {
	tmpDir := t.TempDir()
	t.Setenv("HECTO_CONFIG_DIR", tmpDir)
	origConfigHome := os.Getenv("XDG_CONFIG_HOME")
	origCacheHome := os.Getenv("XDG_CACHE_HOME")
	os.Setenv("XDG_CONFIG_HOME", filepath.Join(tmpDir, "config"))
	os.Setenv("XDG_CACHE_HOME", filepath.Join(tmpDir, "cache"))
	t.Cleanup(func() {
		os.Setenv("XDG_CONFIG_HOME", origConfigHome)
		os.Setenv("XDG_CACHE_HOME", origCacheHome)
	})

	tests := []struct {
		name string
	}{
		{
			name: "should initialize app successfully",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			app := NewApp()
			
			// Simulate the context that Wails provides
			ctx := context.Background()
			
			// Startup should not panic
			assert.NotPanics(t, func() {
				app.startup(ctx)
			}, "startup should not panic")
		})
	}
}

func TestApp_CollectionCRUD_And_Switch(t *testing.T) {
	tmpDir := t.TempDir()
	t.Setenv("HECTO_CONFIG_DIR", tmpDir)
	origConfigHome := os.Getenv("XDG_CONFIG_HOME")
	origCacheHome := os.Getenv("XDG_CACHE_HOME")
	os.Setenv("XDG_CONFIG_HOME", filepath.Join(tmpDir, "config"))
	os.Setenv("XDG_CACHE_HOME", filepath.Join(tmpDir, "cache"))
	t.Cleanup(func() {
		os.Setenv("XDG_CONFIG_HOME", origConfigHome)
		os.Setenv("XDG_CACHE_HOME", origCacheHome)
	})

	app := NewApp()
	ctx := context.Background()
	app.startup(ctx)

	// 1. Initial list: should contain "default" which is active and default
	listRes := app.ListCollections()
	assert.True(t, listRes.Success)
	list, ok := listRes.Data.([]model.Collection)
	assert.True(t, ok)
	assert.Len(t, list, 1)
	assert.Equal(t, "default", list[0].ID)
	assert.True(t, list[0].IsDefault)
	assert.True(t, list[0].IsActive)

	// 2. Create new collection "Project Beta"
	createRes := app.CreateCollection("Project Beta")
	assert.True(t, createRes.Success)
	betaColl, ok := createRes.Data.(model.Collection)
	assert.True(t, ok)
	assert.Len(t, betaColl.ID, 36)
	assert.Equal(t, "Project Beta", betaColl.Name)

	// 3. Rename collection
	renameRes := app.RenameCollection(betaColl.ID, "Project Beta Renamed")
	assert.True(t, renameRes.Success)
	renamedColl, ok := renameRes.Data.(model.Collection)
	assert.True(t, ok)
	assert.Equal(t, "Project Beta Renamed", renamedColl.Name)

	// 4. Duplicate collection
	dupRes := app.DuplicateCollection(betaColl.ID)
	assert.True(t, dupRes.Success)
	dupColl, ok := dupRes.Data.(model.Collection)
	assert.True(t, ok)
	assert.Equal(t, "Project Beta Renamed (bản sao)", dupColl.Name)

	// 4b. Update collection with variables
	updateCollRes := app.UpdateCollection(model.Collection{
		ID:          betaColl.ID,
		Name:        "Project Beta Renamed",
		Description: "Updated description",
		Variables: []model.KVPair{
			{Key: "collVar", Value: "collVal", Enabled: true},
		},
	})
	assert.True(t, updateCollRes.Success)
	updatedColl, ok := updateCollRes.Data.(model.Collection)
	assert.True(t, ok)
	assert.Equal(t, "Updated description", updatedColl.Description)
	assert.Len(t, updatedColl.Variables, 1)
	assert.Equal(t, "collVar", updatedColl.Variables[0].Key)

	// 5. Switch to Beta
	switchRes := app.SwitchCollection(betaColl.ID)
	assert.True(t, switchRes.Success)
	assert.Equal(t, betaColl.ID, app.activeCollection)
	assert.Equal(t, filepath.Join(app.collectionsRoot, betaColl.ID), app.collRoot)

	// Verify tree loads from new active root
	treeRes := app.GetCollectionTree()
	assert.True(t, treeRes.Success)

	// 6. Delete default collection -> must be rejected
	delDefaultRes := app.DeleteCollection("default")
	assert.False(t, delDefaultRes.Success)
	assert.Equal(t, model.ErrValidation, delDefaultRes.Error.Code)

	// 7. Delete active collection (Beta) -> must auto-fallback to default before deleting folder
	delActiveRes := app.DeleteCollection(betaColl.ID)
	assert.True(t, delActiveRes.Success)
	payload, ok := delActiveRes.Data.(map[string]interface{})
	assert.True(t, ok)
	assert.Equal(t, "default", payload["active_collection"])
	assert.Equal(t, "default", app.activeCollection)
	assert.Equal(t, filepath.Join(app.collectionsRoot, "default"), app.collRoot)
	assert.False(t, app.fs.Exists(filepath.Join(app.collectionsRoot, betaColl.ID)))

	// 8. Delete non-existent collection -> NOT_FOUND
	delMissingRes := app.DeleteCollection("non-existent-collection")
	assert.False(t, delMissingRes.Success)
	assert.Equal(t, model.ErrNotFound, delMissingRes.Error.Code)
}

func TestApp_UpdateCollectionRoot(t *testing.T) {
	tmpDir := t.TempDir()
	t.Setenv("HECTO_CONFIG_DIR", tmpDir)
	origConfigHome := os.Getenv("XDG_CONFIG_HOME")
	origCacheHome := os.Getenv("XDG_CACHE_HOME")
	os.Setenv("XDG_CONFIG_HOME", filepath.Join(tmpDir, "config"))
	os.Setenv("XDG_CACHE_HOME", filepath.Join(tmpDir, "cache"))
	t.Cleanup(func() {
		os.Setenv("XDG_CONFIG_HOME", origConfigHome)
		os.Setenv("XDG_CACHE_HOME", origCacheHome)
	})

	app := NewApp()
	ctx := context.Background()
	app.startup(ctx)

	// 1. Create a non-default collection and switch to it first
	createRes := app.CreateCollection("Initial Project")
	assert.True(t, createRes.Success)
	coll := createRes.Data.(model.Collection)
	switchRes := app.SwitchCollection(coll.ID)
	assert.True(t, switchRes.Success)
	assert.Equal(t, coll.ID, app.activeCollection)

	// 2. Update collection root to new path
	newCollectionsRoot := filepath.Join(tmpDir, "custom-collections")
	updateRes := app.UpdateCollectionRoot(newCollectionsRoot)
	assert.True(t, updateRes.Success)

	// Verify app fields
	assert.Equal(t, newCollectionsRoot, app.collectionsRoot)
	assert.Equal(t, "default", app.activeCollection)
	assert.Equal(t, filepath.Join(newCollectionsRoot, "default"), app.collRoot)

	// Verify default collection scaffolded and tree load works (index rebuild)
	treeRes := app.GetCollectionTree()
	assert.True(t, treeRes.Success)

	// 3. Update collection root with empty string (fallback to default resolved cache path)
	updateEmptyRes := app.UpdateCollectionRoot("")
	assert.True(t, updateEmptyRes.Success)
	assert.NotEmpty(t, app.collectionsRoot)
	assert.Equal(t, "default", app.activeCollection)
	assert.Equal(t, filepath.Join(app.collectionsRoot, "default"), app.collRoot)
}

const (
	backendMaxBootTimeMs = int64(2000)
	backendWarnRAMMB     = int64(80)
	backendMaxRAMMB      = int64(100)
	backendWarnRAMBytes  = backendWarnRAMMB * 1024 * 1024
	backendMaxRAMBytes   = backendMaxRAMMB * 1024 * 1024
)

type backendNFRMemorySample struct {
	Label          string `json:"label"`
	TimestampISO   string `json:"timestampIso"`
	AllocBytes     int64  `json:"allocBytes"`
	HeapInuseBytes int64  `json:"heapInuseBytes"`
	SysBytes       int64  `json:"sysBytes"`
	AllocMB        int64  `json:"allocMB"`
}

type backendNFREvidence struct {
	Status           string                   `json:"status"`
	BootPassed       bool                     `json:"bootPassed"`
	RAMPassed        bool                     `json:"ramPassed"`
	BootTimeMs       int64                    `json:"bootTimeMs"`
	BaselineRAMBytes int64                    `json:"baselineRamBytes"`
	PeakRAMBytes     int64                    `json:"peakRamBytes"`
	BaselineRAMMB    int64                    `json:"baselineRamMB"`
	PeakRAMMB        int64                    `json:"peakRamMB"`
	MaxBootTimeMs    int64                    `json:"maxBootTimeMs"`
	WarnRAMMB        int64                    `json:"warnRamMB"`
	MaxRAMMB         int64                    `json:"maxRamMB"`
	Warnings         []string                 `json:"warnings"`
	Failures         []string                 `json:"failures"`
	Samples          []backendNFRMemorySample `json:"samples"`
	EvaluatedAtISO   string                   `json:"evaluatedAtIso"`
}

func bytesToCeilMB(b int64) int64 {
	if b < 0 {
		return -1
	}
	if b == 0 {
		return 0
	}
	const mb = 1024 * 1024
	return (b + mb - 1) / mb
}

func sampleEffectiveRAMBytes(s backendNFRMemorySample) int64 {
	if s.AllocBytes < 0 || s.HeapInuseBytes < 0 {
		return -1
	}
	if s.HeapInuseBytes > s.AllocBytes {
		return s.HeapInuseBytes
	}
	return s.AllocBytes
}

func sampleGoRuntimeMemory(label string) backendNFRMemorySample {
	var m runtime.MemStats
	runtime.ReadMemStats(&m)
	allocBytes := int64(m.Alloc)
	heapInuse := int64(m.HeapInuse)
	effective := allocBytes
	if heapInuse > effective {
		effective = heapInuse
	}
	return backendNFRMemorySample{
		Label:          label,
		TimestampISO:   time.Now().UTC().Format(time.RFC3339),
		AllocBytes:     allocBytes,
		HeapInuseBytes: heapInuse,
		SysBytes:       int64(m.Sys),
		AllocMB:        bytesToCeilMB(effective),
	}
}

func evaluateBackendNFRMetrics(bootTimeMs int64, samples []backendNFRMemorySample) backendNFREvidence {
	warnings := []string{}
	failures := []string{}

	bootPassed := true
	if bootTimeMs < 0 {
		bootPassed = false
		failures = append(failures, "Invalid bootTimeMs measurement (must be >= 0)")
	} else if bootTimeMs > backendMaxBootTimeMs {
		bootPassed = false
		failures = append(failures, fmt.Sprintf("Startup bootTimeMs (%d ms) exceeded NFR budget (%d ms)", bootTimeMs, backendMaxBootTimeMs))
	}

	ramPassed := true
	baselineRAMBytes := int64(-1)
	peakRAMBytes := int64(-1)

	if len(samples) == 0 {
		ramPassed = false
		failures = append(failures, "Memory sample list cannot be empty")
	} else {
		baselineRAMBytes = sampleEffectiveRAMBytes(samples[0])
		peakRAMBytes = baselineRAMBytes
		for _, s := range samples {
			eff := sampleEffectiveRAMBytes(s)
			if eff < 0 {
				ramPassed = false
				failures = append(failures, fmt.Sprintf("Invalid memory sample %q", s.Label))
			} else if eff > peakRAMBytes {
				peakRAMBytes = eff
			}
		}

		if baselineRAMBytes < 0 || peakRAMBytes < 0 {
			ramPassed = false
		} else {
			if baselineRAMBytes > backendMaxRAMBytes {
				ramPassed = false
				failures = append(failures, fmt.Sprintf("Baseline RAM (%d MB) exceeded NFR hard limit (%d MB)", bytesToCeilMB(baselineRAMBytes), backendMaxRAMMB))
			} else if baselineRAMBytes > backendWarnRAMBytes {
				warnings = append(warnings, fmt.Sprintf("Baseline RAM (%d MB) is within warning zone (%d-%d MB)", bytesToCeilMB(baselineRAMBytes), backendWarnRAMMB, backendMaxRAMMB))
			}

			if peakRAMBytes > backendMaxRAMBytes {
				ramPassed = false
				failures = append(failures, fmt.Sprintf("Peak execution RAM (%d MB) exceeded NFR hard limit (%d MB)", bytesToCeilMB(peakRAMBytes), backendMaxRAMMB))
			} else if peakRAMBytes > backendWarnRAMBytes {
				warnings = append(warnings, fmt.Sprintf("Peak execution RAM (%d MB) is within warning zone (%d-%d MB)", bytesToCeilMB(peakRAMBytes), backendWarnRAMMB, backendMaxRAMMB))
			}
		}
	}

	status := "PASS"
	if !bootPassed || !ramPassed || len(failures) > 0 {
		status = "FAIL"
	} else if len(warnings) > 0 {
		status = "WARN"
	}

	return backendNFREvidence{
		Status:           status,
		BootPassed:       bootPassed,
		RAMPassed:        ramPassed,
		BootTimeMs:       bootTimeMs,
		BaselineRAMBytes: baselineRAMBytes,
		PeakRAMBytes:     peakRAMBytes,
		BaselineRAMMB:    bytesToCeilMB(baselineRAMBytes),
		PeakRAMMB:        bytesToCeilMB(peakRAMBytes),
		MaxBootTimeMs:    backendMaxBootTimeMs,
		WarnRAMMB:        backendWarnRAMMB,
		MaxRAMMB:         backendMaxRAMMB,
		Warnings:         warnings,
		Failures:         failures,
		Samples:          samples,
		EvaluatedAtISO:   time.Now().UTC().Format(time.RFC3339),
	}
}

func TestEvaluateBackendNFRMetrics(t *testing.T) {
	const mb = int64(1024 * 1024)

	t.Run("PASS when startup <= 2000ms and RAM <= 80MB", func(t *testing.T) {
		ev := evaluateBackendNFRMetrics(120, []backendNFRMemorySample{
			{Label: "baseline", AllocBytes: 10 * mb, HeapInuseBytes: 15 * mb},
			{Label: "crud", AllocBytes: 18 * mb, HeapInuseBytes: 22 * mb},
		})
		assert.Equal(t, "PASS", ev.Status)
		assert.True(t, ev.BootPassed)
		assert.True(t, ev.RAMPassed)
		assert.Equal(t, int64(15), ev.BaselineRAMMB)
		assert.Equal(t, int64(22), ev.PeakRAMMB)
		assert.Empty(t, ev.Warnings)
		assert.Empty(t, ev.Failures)
	})

	t.Run("WARN when RAM is in warning zone (80MB < RAM <= 100MB)", func(t *testing.T) {
		ev := evaluateBackendNFRMetrics(400, []backendNFRMemorySample{
			{Label: "baseline", AllocBytes: 50 * mb, HeapInuseBytes: 85 * mb},
			{Label: "crud", AllocBytes: 60 * mb, HeapInuseBytes: 90 * mb},
		})
		assert.Equal(t, "WARN", ev.Status)
		assert.True(t, ev.BootPassed)
		assert.True(t, ev.RAMPassed)
		assert.Len(t, ev.Warnings, 2)
		assert.Empty(t, ev.Failures)
	})

	t.Run("FAIL when bootTimeMs > 2000ms, RAM > 100MB, or samples empty", func(t *testing.T) {
		bootFail := evaluateBackendNFRMetrics(2001, []backendNFRMemorySample{
			{Label: "baseline", AllocBytes: 10 * mb, HeapInuseBytes: 12 * mb},
		})
		assert.Equal(t, "FAIL", bootFail.Status)
		assert.False(t, bootFail.BootPassed)
		assert.NotEmpty(t, bootFail.Failures)

		ramFail := evaluateBackendNFRMetrics(300, []backendNFRMemorySample{
			{Label: "baseline", AllocBytes: 20 * mb, HeapInuseBytes: 105 * mb},
		})
		assert.Equal(t, "FAIL", ramFail.Status)
		assert.False(t, ramFail.RAMPassed)
		assert.NotEmpty(t, ramFail.Failures)

		emptyFail := evaluateBackendNFRMetrics(300, nil)
		assert.Equal(t, "FAIL", emptyFail.Status)
		assert.False(t, emptyFail.RAMPassed)
		assert.NotEmpty(t, emptyFail.Failures)
	})
}

func TestApp_NFRStartupAndMemory(t *testing.T) {
	tmpDir := t.TempDir()
	t.Setenv("HECTO_CONFIG_DIR", tmpDir)
	t.Setenv("XDG_CONFIG_HOME", filepath.Join(tmpDir, "config"))
	t.Setenv("XDG_CACHE_HOME", filepath.Join(tmpDir, "cache"))

	bootTimeMs := int64(-1)
	var samples []backendNFRMemorySample
	artifactWritten := false

	defer func() {
		if artifactWritten {
			return
		}
		evidence := evaluateBackendNFRMetrics(bootTimeMs, samples)
		resultsDir := filepath.Join("test-results")
		if err := os.MkdirAll(resultsDir, 0o755); err == nil {
			artifactPath := filepath.Join(resultsDir, "backend-nfr-metrics.json")
			if payload, err := json.MarshalIndent(evidence, "", "  "); err == nil {
				_ = os.WriteFile(artifactPath, payload, 0o644)
			}
		}
	}()

	runtime.GC()
	start := time.Now()
	app := NewApp()
	ctx := context.Background()
	app.startup(ctx)
	treeRes := app.GetCollectionTree()
	require.True(t, treeRes.Success, "GetCollectionTree must succeed on cold start")
	elapsedNs := time.Since(start).Nanoseconds()
	if elapsedNs <= 0 {
		bootTimeMs = 1
	} else {
		bootTimeMs = (elapsedNs + int64(time.Millisecond) - 1) / int64(time.Millisecond)
	}

	baselineSample := sampleGoRuntimeMemory("01-baseline-after-startup")
	samples = append(samples, baselineSample)

	// Execute CRUD operations and sample memory throughout execution
	folderRes := app.CreateFolder("")
	require.True(t, folderRes.Success)
	folderNode, ok := folderRes.Data.(model.TreeNode)
	require.True(t, ok)
	samples = append(samples, sampleGoRuntimeMemory("02-after-create-folder"))

	reqRes := app.CreateRequest(folderNode.ID)
	require.True(t, reqRes.Success)
	reqNode, ok := reqRes.Data.(model.TreeNode)
	require.True(t, ok)
	samples = append(samples, sampleGoRuntimeMemory("03-after-create-request"))

	saveRes := app.SaveRequest(model.Request{
		ID:     reqNode.ID,
		Name:   "NFR Benchmark Request",
		Method: "POST",
		URL:    "https://api.hecto.local/v1/nfr",
		Headers: []model.KVPair{
			{Key: "Content-Type", Value: "application/json", Enabled: true},
		},
		Body: model.Body{
			Type:    "json",
			Content: `{"benchmark":true}`,
		},
	})
	require.True(t, saveRes.Success)
	samples = append(samples, sampleGoRuntimeMemory("04-after-save-request"))

	delFolderRes := app.DeleteFolder(folderNode.ID)
	require.True(t, delFolderRes.Success)
	samples = append(samples, sampleGoRuntimeMemory("05-after-delete-folder"))

	evidence := evaluateBackendNFRMetrics(bootTimeMs, samples)
	resultsDir := filepath.Join("test-results")
	require.NoError(t, os.MkdirAll(resultsDir, 0o755))
	artifactPath := filepath.Join(resultsDir, "backend-nfr-metrics.json")
	payload, err := json.MarshalIndent(evidence, "", "  ")
	require.NoError(t, err)
	require.NoError(t, os.WriteFile(artifactPath, payload, 0o644))
	artifactWritten = true

	assert.True(t, evidence.BootPassed, "Cold start bootTimeMs (%d ms) must be <= %d ms", evidence.BootTimeMs, evidence.MaxBootTimeMs)
	assert.True(t, evidence.RAMPassed, "RAM consumption (baseline=%d B, peak=%d B) must be <= %d B", evidence.BaselineRAMBytes, evidence.PeakRAMBytes, backendMaxRAMBytes)
}

func TestApp_SyncActiveCollectionFromDisk_And_WatcherEvent(t *testing.T) {
	tmpDir := t.TempDir()
	t.Setenv("HECTO_CONFIG_DIR", tmpDir)

	app := NewApp()
	ctx := context.Background()
	app.startup(ctx)
	defer app.shutdown(ctx)

	assert.Equal(t, "default", app.activeCollection)
	require.NotNil(t, app.watcher)

	// 1. Create a second collection "CLI-Created"
	createRes := app.CreateCollection("CLI-Created")
	require.True(t, createRes.Success)
	newColl := createRes.Data.(model.Collection)

	// Simulate external CLI switching active_collection in config.json on disk without calling app.SwitchCollection
	_, err := app.cfgSvc.SwitchActiveCollection(ctx, newColl.ID)
	require.NoError(t, err)

	// Calling app.ListCollections() or app.GetCollectionTree() must sync app.activeCollection, app.collRoot, and watcher root
	listRes := app.ListCollections()
	require.True(t, listRes.Success)
	assert.Equal(t, newColl.ID, app.activeCollection)
	expectedRoot := filepath.Join(app.collectionsRoot, newColl.ID)
	assert.Equal(t, expectedRoot, app.collRoot)
	assert.Equal(t, filepath.Clean(expectedRoot), app.watcher.RootDir())

	// 2. Wait for self-write window to expire, then simulate external CLI writing a file inside newColl
	time.Sleep(450 * time.Millisecond)

	eventCh := make(chan map[string]interface{}, 1)
	app.onEvent = func(eventName string, data ...interface{}) {
		if eventName == "collection:external-change" && len(data) > 0 {
			if m, ok := data[0].(map[string]interface{}); ok {
				select {
				case eventCh <- m:
				default:
				}
			}
		}
	}

	err = os.WriteFile(filepath.Join(expectedRoot, "cli-req.json"), []byte(`{"id":"cli-1","name":"FromCLI","method":"GET","url":"https://example.com"}`), 0644)
	require.NoError(t, err)

	select {
	case payload := <-eventCh:
		assert.Equal(t, newColl.ID, payload["collectionId"])
		assert.NotEmpty(t, payload["timestamp"])
	case <-time.After(1500 * time.Millisecond):
		t.Fatal("expected collection:external-change event after external file write")
	}
}

