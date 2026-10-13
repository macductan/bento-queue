package main

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"

	"hecto-api/model"
)

func TestApp_startup(t *testing.T) {
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
	assert.Equal(t, "default", list[0].Slug)
	assert.True(t, list[0].IsDefault)
	assert.True(t, list[0].IsActive)

	// 2. Create new collection "Project Beta"
	createRes := app.CreateCollection("Project Beta")
	assert.True(t, createRes.Success)
	betaColl, ok := createRes.Data.(model.Collection)
	assert.True(t, ok)
	assert.Contains(t, betaColl.Slug, "project-beta-")
	assert.Equal(t, "Project Beta", betaColl.Name)

	// 3. Rename collection
	renameRes := app.RenameCollection(betaColl.Slug, "Project Beta Renamed")
	assert.True(t, renameRes.Success)
	renamedColl, ok := renameRes.Data.(model.Collection)
	assert.True(t, ok)
	assert.Equal(t, "Project Beta Renamed", renamedColl.Name)

	// 4. Duplicate collection
	dupRes := app.DuplicateCollection(betaColl.Slug)
	assert.True(t, dupRes.Success)
	dupColl, ok := dupRes.Data.(model.Collection)
	assert.True(t, ok)
	assert.Equal(t, "Project Beta Renamed (bản sao)", dupColl.Name)

	// 5. Switch to Beta
	switchRes := app.SwitchCollection(betaColl.Slug)
	assert.True(t, switchRes.Success)
	assert.Equal(t, betaColl.Slug, app.activeCollection)
	assert.Equal(t, filepath.Join(app.collectionsRoot, betaColl.Slug), app.collRoot)

	// Verify tree loads from new active root
	treeRes := app.GetCollectionTree()
	assert.True(t, treeRes.Success)

	// 6. Delete default collection -> must be rejected
	delDefaultRes := app.DeleteCollection("default")
	assert.False(t, delDefaultRes.Success)
	assert.Equal(t, model.ErrValidation, delDefaultRes.Error.Code)

	// 7. Delete active collection (Beta) -> must auto-fallback to default before deleting folder
	delActiveRes := app.DeleteCollection(betaColl.Slug)
	assert.True(t, delActiveRes.Success)
	payload, ok := delActiveRes.Data.(map[string]interface{})
	assert.True(t, ok)
	assert.Equal(t, "default", payload["active_collection"])
	assert.Equal(t, "default", app.activeCollection)
	assert.Equal(t, filepath.Join(app.collectionsRoot, "default"), app.collRoot)
	assert.False(t, app.fs.Exists(filepath.Join(app.collectionsRoot, betaColl.Slug)))

	// 8. Delete non-existent collection -> NOT_FOUND
	delMissingRes := app.DeleteCollection("non-existent-collection")
	assert.False(t, delMissingRes.Success)
	assert.Equal(t, model.ErrNotFound, delMissingRes.Error.Code)
}

func TestApp_UpdateCollectionRoot(t *testing.T) {
	tmpDir := t.TempDir()
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
	switchRes := app.SwitchCollection(coll.Slug)
	assert.True(t, switchRes.Success)
	assert.Equal(t, coll.Slug, app.activeCollection)

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
