package engine

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"hecto-api/model"
	"hecto-api/service"
	"hecto-api/storage"
)

func TestExecuteFlow_Sequential_ParallelDeterministicMerge_And_Branches(t *testing.T) {
	tmpDir := t.TempDir()
	fs := storage.NewFileSystem()
	logger := newTestLogger()
	cfgSvc := service.NewConfigService(fs, logger)
	cfgSvc.SetCustomConfigDir(tmpDir)
	cfg, err := cfgSvc.Initialize(context.Background())
	if err != nil {
		t.Fatalf("Initialize failed: %v", err)
	}

	collSvc := service.NewCollectionService(fs, logger)
	envSvc := service.NewEnvironmentService(fs, logger)
	reqSvc := service.NewRequestService(fs, logger)

	coll, collRoot, err := collSvc.ResolveCollectionSelector(cfg.CollectionsRoot, cfg.ActiveCollection, "default")
	if err != nil {
		t.Fatal(err)
	}

	var parallelInFlight atomic.Int32
	var maxConcurrentObserved atomic.Int32
	var checkoutReceivedToken string
	var checkoutReceivedShared string

	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/auth/login":
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"token":"jwt-flow-123"}`))
		case "/users/profile", "/catalog/cart":
			cur := parallelInFlight.Add(1)
			for {
				prev := maxConcurrentObserved.Load()
				if cur <= prev || maxConcurrentObserved.CompareAndSwap(prev, cur) {
					break
				}
			}
			time.Sleep(40 * time.Millisecond)
			parallelInFlight.Add(-1)

			if r.Header.Get("Authorization") != "Bearer jwt-flow-123" {
				w.WriteHeader(http.StatusUnauthorized)
				_, _ = w.Write([]byte(`{"error":"unauthorized"}`))
				return
			}
			w.WriteHeader(http.StatusOK)
			if r.URL.Path == "/users/profile" {
				_, _ = w.Write([]byte(`{"user":"alice"}`))
			} else {
				_, _ = w.Write([]byte(`{"items":[{"id":1,"code":"CART_READY"}]}`))
			}
		case "/orders/checkout":
			checkoutReceivedToken = r.Header.Get("Authorization")
			checkoutReceivedShared = r.Header.Get("X-Shared-Var")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"order_id":"ord-999"}`))
		case "/alerts/notify":
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"notified":true}`))
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer ts.Close()

	// Create Staging environment
	envRes := envSvc.Save(collRoot, model.Environment{
		Name: "Staging",
		Variables: []model.KVPair{
			{Key: "base_url", Value: ts.URL, Enabled: true},
		},
	})
	stgEnv := envRes.Data.(model.Environment)
	coll.ActiveEnvID = stgEnv.ID
	coll.Auth = &model.AuthConfig{
		Type:   "bearer",
		Bearer: &model.BearerAuth{Token: "{{auth_token}}"},
	}
	collSvc.UpdateCollection(cfg.CollectionsRoot, coll)

	// Create folders: Auth, Users, Catalog, Orders, Alerts
	authFolder := collSvc.CreateFolder(collRoot, "").Data.(model.TreeNode)
	collSvc.RenameFolder(authFolder.ID, "Auth")
	usersFolder := collSvc.CreateFolder(collRoot, "").Data.(model.TreeNode)
	collSvc.RenameFolder(usersFolder.ID, "Users")
	catalogFolder := collSvc.CreateFolder(collRoot, "").Data.(model.TreeNode)
	collSvc.RenameFolder(catalogFolder.ID, "Catalog")
	ordersFolder := collSvc.CreateFolder(collRoot, "").Data.(model.TreeNode)
	collSvc.RenameFolder(ordersFolder.ID, "Orders")
	alertsFolder := collSvc.CreateFolder(collRoot, "").Data.(model.TreeNode)
	collSvc.RenameFolder(alertsFolder.ID, "Alerts")

	// 1. Auth/Login
	rLoginNode := collSvc.CreateRequest(collRoot, authFolder.ID).Data.(model.TreeNode)
	reqSvc.Save(model.Request{
		ID:     rLoginNode.ID,
		Name:   "Login",
		Method: "POST",
		URL:    "{{base_url}}/auth/login",
		Auth:   &model.AuthConfig{Type: "none"},
		Scripts: &model.Scripts{
			PostResponse: `
				const data = ha.response.json();
				ha.collectionVariables.set("auth_token", data.token);
			`,
		},
	})

	// 2. Users/GetProfile (parallel step 1)
	rProfileNode := collSvc.CreateRequest(collRoot, usersFolder.ID).Data.(model.TreeNode)
	reqSvc.Save(model.Request{
		ID:     rProfileNode.ID,
		Name:   "GetProfile",
		Method: "GET",
		URL:    "{{base_url}}/users/profile",
		Auth:   &model.AuthConfig{Type: "inherit"},
		Scripts: &model.Scripts{
			PostResponse: `
				ha.collectionVariables.set("shared", "from1");
				ha.collectionVariables.set("varA", "1");
				ha.folderVariables.set("user_loaded", "true");
			`,
		},
	})

	// 3. Catalog/GetCart (parallel step 2)
	rCartNode := collSvc.CreateRequest(collRoot, catalogFolder.ID).Data.(model.TreeNode)
	reqSvc.Save(model.Request{
		ID:     rCartNode.ID,
		Name:   "GetCart",
		Method: "GET",
		URL:    "{{base_url}}/catalog/cart",
		Auth:   &model.AuthConfig{Type: "inherit"},
		Scripts: &model.Scripts{
			PostResponse: `
				ha.collectionVariables.set("shared", "from2");
				ha.collectionVariables.set("varB", "2");
				ha.folderVariables.set("cart_loaded", "true");
			`,
		},
	})

	// 4. Orders/Checkout (Success branch)
	rCheckoutNode := collSvc.CreateRequest(collRoot, ordersFolder.ID).Data.(model.TreeNode)
	reqSvc.Save(model.Request{
		ID:     rCheckoutNode.ID,
		Name:   "Checkout",
		Method: "POST",
		URL:    "{{base_url}}/orders/checkout",
		Auth:   &model.AuthConfig{Type: "inherit"},
		Headers: []model.KVPair{
			{Key: "X-Shared-Var", Value: "{{shared}}-{{varA}}-{{varB}}", Enabled: true},
		},
	})

	// 5. Alerts/NotifyFailure (Error branch - should be skipped)
	rAlertNode := collSvc.CreateRequest(collRoot, alertsFolder.ID).Data.(model.TreeNode)
	reqSvc.Save(model.Request{
		ID:     rAlertNode.ID,
		Name:   "NotifyFailure",
		Method: "POST",
		URL:    "{{base_url}}/alerts/notify",
	})

	flow := model.Flow{
		ID:        "flow-e2e-order",
		Name:      "Order Payment Flow",
		Layout:    "vertical",
		TimeoutMs: 5000,
		MaxSteps:  100,
		Nodes: []model.FlowNode{
			{
				ID: "node-1",
				Steps: []model.FlowStep{
					{ID: "step-login", RequestID: rLoginNode.ID, Enabled: true},
				},
			},
			{
				ID: "node-2-parallel",
				Steps: []model.FlowStep{
					{ID: "step-profile", RequestID: rProfileNode.ID, Enabled: true},
					{ID: "step-cart", RequestID: rCartNode.ID, Enabled: true},
				},
				Branches: []model.FlowBranch{
					{
						ID:        "branch-success",
						Name:      "Thành công",
						Condition: model.FlowBranchCondition{Type: "success"},
						Nodes: []model.FlowNode{
							{
								ID: "node-3-checkout",
								Steps: []model.FlowStep{
									{ID: "step-checkout", RequestID: rCheckoutNode.ID, Enabled: true},
								},
							},
						},
					},
					{
						ID:        "branch-error",
						Name:      "Khi Lỗi",
						Condition: model.FlowBranchCondition{Type: "error"},
						Nodes: []model.FlowNode{
							{
								ID: "node-4-alert",
								Steps: []model.FlowStep{
									{ID: "step-alert", RequestID: rAlertNode.ID, Enabled: true},
								},
							},
						},
					},
				},
			},
		},
	}

	flowOut, err := ExecuteFlow(FlowRunOptions{
		FS:              fs,
		CollectionSvc:   collSvc,
		EnvSvc:          envSvc,
		RequestSvc:      reqSvc,
		CollectionsRoot: cfg.CollectionsRoot,
		CollectionRoot:  collRoot,
		Collection:      coll,
		Flow:            flow,
		ActiveEnvID:     stgEnv.ID,
	})
	if err != nil {
		t.Fatalf("ExecuteFlow failed: %v", err)
	}

	if flowOut.Status != "passed" {
		t.Fatalf("expected flowOut.Status == 'passed', got %q (halted_error=%q)", flowOut.Status, flowOut.HaltedError)
	}
	if flowOut.StepsExecuted != 4 || flowOut.StepsPassed != 4 || flowOut.StepsFailed != 0 || flowOut.StepsSkipped != 1 {
		t.Errorf("unexpected step counts: executed=%d passed=%d failed=%d skipped=%d",
			flowOut.StepsExecuted, flowOut.StepsPassed, flowOut.StepsFailed, flowOut.StepsSkipped)
	}
	if maxConcurrentObserved.Load() < 2 {
		t.Errorf("expected parallel steps to execute concurrently (maxConcurrentObserved >= 2), got %d", maxConcurrentObserved.Load())
	}
	if checkoutReceivedToken != "Bearer jwt-flow-123" {
		t.Errorf("checkoutReceivedToken = %q, want 'Bearer jwt-flow-123'", checkoutReceivedToken)
	}
	if checkoutReceivedShared != "from2-1-2" {
		t.Errorf("checkoutReceivedShared = %q, want 'from2-1-2' (deterministic parallel merge)", checkoutReceivedShared)
	}

	// Verify disk persistence after parallel merge:
	// 1. collection.json has shared="from2", varA="1", varB="2", auth_token="jwt-flow-123"
	var diskColl model.Collection
	if err := fs.ReadJSON(filepath.Join(collRoot, "collection.json"), &diskColl); err != nil {
		t.Fatalf("failed reading collection.json: %v", err)
	}
	collVarMap := map[string]string{}
	for _, kv := range diskColl.Variables {
		collVarMap[kv.Key] = kv.Value
	}
	if collVarMap["shared"] != "from2" || collVarMap["varA"] != "1" || collVarMap["varB"] != "2" || collVarMap["auth_token"] != "jwt-flow-123" {
		t.Errorf("unexpected collection variables on disk: %+v", collVarMap)
	}

	// 2. Both Users/_folder.json and Catalog/_folder.json have their respective nearest-folder variables persisted
	uFolderDisk := collSvc.LoadFolder(usersFolder.ID).Data.(model.Folder)
	if len(uFolderDisk.Variables) != 1 || uFolderDisk.Variables[0].Key != "user_loaded" || uFolderDisk.Variables[0].Value != "true" {
		t.Errorf("expected user_loaded='true' in Users/_folder.json, got %+v", uFolderDisk.Variables)
	}
	cFolderDisk := collSvc.LoadFolder(catalogFolder.ID).Data.(model.Folder)
	if len(cFolderDisk.Variables) != 1 || cFolderDisk.Variables[0].Key != "cart_loaded" || cFolderDisk.Variables[0].Value != "true" {
		t.Errorf("expected cart_loaded='true' in Catalog/_folder.json, got %+v", cFolderDisk.Variables)
	}
}

func TestExecuteFlow_CustomBranchPriority_NegativeTest_DeletedRequest_Timeout_And_MaxSteps(t *testing.T) {
	tmpDir := t.TempDir()
	fs := storage.NewFileSystem()
	logger := newTestLogger()
	cfgSvc := service.NewConfigService(fs, logger)
	cfgSvc.SetCustomConfigDir(tmpDir)
	cfg, err := cfgSvc.Initialize(context.Background())
	if err != nil {
		t.Fatal(err)
	}

	collSvc := service.NewCollectionService(fs, logger)
	reqSvc := service.NewRequestService(fs, logger)
	coll, collRoot, err := collSvc.ResolveCollectionSelector(cfg.CollectionsRoot, cfg.ActiveCollection, "default")
	if err != nil {
		t.Fatal(err)
	}

	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/rate-limited":
			w.WriteHeader(http.StatusTooManyRequests)
			_, _ = w.Write([]byte(`{"data":{"items":[{"code":"RATE_LIMIT_429"}]}}`))
		case "/negative-400":
			w.WriteHeader(http.StatusBadRequest)
			_, _ = w.Write([]byte(`{"error":"bad_input"}`))
		case "/slow":
			time.Sleep(150 * time.Millisecond)
			w.WriteHeader(http.StatusOK)
		default:
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"ok":true}`))
		}
	}))
	defer ts.Close()

	// Request 1: returns 429 with JSON body
	r429Node := collSvc.CreateRequest(collRoot, "").Data.(model.TreeNode)
	reqSvc.Save(model.Request{
		ID:     r429Node.ID,
		Name:   "RateLimitedCall",
		Method: "GET",
		URL:    ts.URL + "/rate-limited",
	})

	// Request 2: Negative Test (HTTP 400 but ha.test() passes)
	rNeg400Node := collSvc.CreateRequest(collRoot, "").Data.(model.TreeNode)
	reqSvc.Save(model.Request{
		ID:     rNeg400Node.ID,
		Name:   "NegativeTest400",
		Method: "POST",
		URL:    ts.URL + "/negative-400",
		Scripts: &model.Scripts{
			PostResponse: `
				ha.test("Expect 400 Bad Request", () => {
					if (ha.response.code !== 400) throw new Error("expected 400");
				});
			`,
		},
	})

	// Request 3: Normal 200 OK
	rOkNode := collSvc.CreateRequest(collRoot, "").Data.(model.TreeNode)
	reqSvc.Save(model.Request{
		ID:     rOkNode.ID,
		Name:   "FallbackOK",
		Method: "GET",
		URL:    ts.URL + "/ok",
	})

	// Request 4: Slow endpoint for per-step TimeoutMs test
	rSlowNode := collSvc.CreateRequest(collRoot, "").Data.(model.TreeNode)
	reqSvc.Save(model.Request{
		ID:     rSlowNode.ID,
		Name:   "SlowEndpoint",
		Method: "GET",
		URL:    ts.URL + "/slow",
	})

	// Case A: Custom branch catches HTTP 429 (matching body_json data.items[0].code == "{{expected_code}}")
	// before error branch, runs NegativeTest400 inside the custom branch (which passes despite HTTP 400),
	// and then continues to node after the branch!
	flowCustomAndNegative := model.Flow{
		ID:        "flow-custom-neg",
		Name:      "Custom Branch & Negative Test",
		TimeoutMs: 5000,
		MaxSteps:  100,
		Nodes: []model.FlowNode{
			{
				ID: "n1-429",
				Steps: []model.FlowStep{
					{ID: "s-429", RequestID: r429Node.ID, Enabled: true},
				},
				Branches: []model.FlowBranch{
					{
						ID:        "br-error-generic",
						Condition: model.FlowBranchCondition{Type: "error"},
						Nodes: []model.FlowNode{
							{
								ID:    "n-err",
								Steps: []model.FlowStep{{ID: "s-err", RequestID: rOkNode.ID, Enabled: true}},
							},
						},
					},
					{
						ID:   "br-custom-json",
						Name: "Custom 429 JSON Match",
						Condition: model.FlowBranchCondition{
							Type:     "custom",
							Source:   "body_json",
							Path:     "data.items[0].code",
							Operator: "==",
							Value:    "{{expected_code}}",
						},
						Nodes: []model.FlowNode{
							{
								ID:    "n-neg-400",
								Steps: []model.FlowStep{{ID: "s-neg-400", RequestID: rNeg400Node.ID, Enabled: true}},
							},
						},
					},
				},
			},
			{
				ID: "n2-after-branch",
				Steps: []model.FlowStep{
					{ID: "s-disabled", RequestID: rOkNode.ID, Enabled: false},
					{ID: "s-final-ok", RequestID: rOkNode.ID, Enabled: true},
				},
			},
		},
	}

	outA, err := ExecuteFlow(FlowRunOptions{
		FS:              fs,
		CollectionSvc:   collSvc,
		RequestSvc:      reqSvc,
		CollectionsRoot: cfg.CollectionsRoot,
		CollectionRoot:  collRoot,
		Collection:      coll,
		Flow:            flowCustomAndNegative,
		CLIVarOverrides: map[string]string{"expected_code": "RATE_LIMIT_429"},
	})
	if err != nil {
		t.Fatalf("ExecuteFlow Case A failed: %v", err)
	}
	if outA.Status != "passed" {
		t.Fatalf("expected Case A Status == 'passed' (429 handled by custom branch + negative test passed), got %q (halted=%q)", outA.Status, outA.HaltedError)
	}
	if outA.NodeResults[0].MatchedBranchID != "br-custom-json" {
		t.Errorf("expected MatchedBranchID == 'br-custom-json', got %q", outA.NodeResults[0].MatchedBranchID)
	}
	// s-429 (failed, handled), s-err (skipped), s-neg-400 (passed), s-disabled (skipped), s-final-ok (passed)
	if outA.StepsExecuted != 3 || outA.StepsPassed != 2 || outA.StepsFailed != 1 || outA.StepsSkipped != 2 {
		t.Errorf("unexpected Case A counts: executed=%d passed=%d failed=%d skipped=%d",
			outA.StepsExecuted, outA.StepsPassed, outA.StepsFailed, outA.StepsSkipped)
	}

	// Case B: Deleted Request halts the Flow with failure_category == "deleted_request" and skips subsequent steps
	flowDeleted := model.Flow{
		ID:   "flow-deleted-req",
		Name: "Deleted Request Flow",
		Nodes: []model.FlowNode{
			{
				ID:    "n-del",
				Steps: []model.FlowStep{{ID: "s-del", RequestID: "non-existent-uuid", Enabled: true}},
			},
			{
				ID:    "n-after-del",
				Steps: []model.FlowStep{{ID: "s-after-del", RequestID: rOkNode.ID, Enabled: true}},
			},
		},
	}
	outB, err := ExecuteFlow(FlowRunOptions{
		FS:              fs,
		CollectionSvc:   collSvc,
		RequestSvc:      reqSvc,
		CollectionsRoot: cfg.CollectionsRoot,
		CollectionRoot:  collRoot,
		Collection:      coll,
		Flow:            flowDeleted,
	})
	if err != nil {
		t.Fatalf("ExecuteFlow Case B failed: %v", err)
	}
	if outB.Status != "failed" || len(outB.StepResults) != 2 {
		t.Fatalf("expected Case B failed with 2 step results, got: %+v", outB)
	}
	if outB.StepResults[0].FailureCategory != "deleted_request" || outB.StepResults[0].Status != "failed" {
		t.Errorf("expected step 0 deleted_request, got: %+v", outB.StepResults[0])
	}
	if outB.StepResults[1].Status != "skipped" {
		t.Errorf("expected step 1 skipped after halt, got: %+v", outB.StepResults[1])
	}

	// Case C: Per-step TimeoutMs override (30ms timeout on 150ms endpoint -> network_or_timeout)
	flowTimeout := model.Flow{
		ID:        "flow-timeout",
		Name:      "Step Timeout Flow",
		TimeoutMs: 5000,
		Nodes: []model.FlowNode{
			{
				ID: "n-slow",
				Steps: []model.FlowStep{
					{ID: "s-slow", RequestID: rSlowNode.ID, Enabled: true, TimeoutMs: 30},
				},
			},
		},
	}
	outC, err := ExecuteFlow(FlowRunOptions{
		FS:              fs,
		CollectionSvc:   collSvc,
		RequestSvc:      reqSvc,
		CollectionsRoot: cfg.CollectionsRoot,
		CollectionRoot:  collRoot,
		Collection:      coll,
		Flow:            flowTimeout,
	})
	if err != nil {
		t.Fatalf("ExecuteFlow Case C failed: %v", err)
	}
	if outC.Status != "failed" || outC.StepResults[0].FailureCategory != "network_or_timeout" {
		t.Errorf("expected network_or_timeout failure, got: %+v", outC.StepResults[0])
	}

	// Case D: max_steps limit (max_steps: 2 with 3 enabled steps -> halts before step 3)
	flowMaxSteps := model.Flow{
		ID:       "flow-max-steps",
		Name:     "Max Steps Guard Flow",
		MaxSteps: 2,
		Nodes: []model.FlowNode{
			{ID: "n1", Steps: []model.FlowStep{{ID: "s1", RequestID: rOkNode.ID, Enabled: true}}},
			{ID: "n2", Steps: []model.FlowStep{{ID: "s2", RequestID: rOkNode.ID, Enabled: true}}},
			{ID: "n3", Steps: []model.FlowStep{{ID: "s3", RequestID: rOkNode.ID, Enabled: true}}},
		},
	}
	outD, err := ExecuteFlow(FlowRunOptions{
		FS:              fs,
		CollectionSvc:   collSvc,
		RequestSvc:      reqSvc,
		CollectionsRoot: cfg.CollectionsRoot,
		CollectionRoot:  collRoot,
		Collection:      coll,
		Flow:            flowMaxSteps,
	})
	if err != nil {
		t.Fatalf("ExecuteFlow Case D failed: %v", err)
	}
	if outD.Status != "failed" || !strings.Contains(outD.HaltedError, "max_steps") {
		t.Errorf("expected failed status with max_steps HaltedError, got status=%q halted_error=%q", outD.Status, outD.HaltedError)
	}
	if outD.StepsExecuted != 2 || outD.StepsPassed != 2 || outD.StepsSkipped != 1 {
		b, _ := json.MarshalIndent(outD, "", "  ")
		t.Errorf("expected 2 executed, 2 passed, 1 skipped, got:\n%s", string(b))
	}

	// Case E: Mid-row MaxSteps truncation on a parallel FlowNode (MaxSteps: 2 with 1 sequential step + 2-step parallel node)
	flowMidRowMaxSteps := model.Flow{
		ID:       "flow-mid-row-max-steps",
		Name:     "Mid-Row Parallel Max Steps Flow",
		MaxSteps: 2,
		Nodes: []model.FlowNode{
			{ID: "n1-seq", Steps: []model.FlowStep{{ID: "s1", RequestID: rOkNode.ID, Enabled: true}}},
			{
				ID: "n2-par",
				Steps: []model.FlowStep{
					{ID: "s2-par-a", RequestID: rOkNode.ID, Enabled: true},
					{ID: "s2-par-b", RequestID: rOkNode.ID, Enabled: true},
				},
			},
			{ID: "n3-after", Steps: []model.FlowStep{{ID: "s3", RequestID: rOkNode.ID, Enabled: true}}},
		},
	}
	outE, err := ExecuteFlow(FlowRunOptions{
		FS:              fs,
		CollectionSvc:   collSvc,
		RequestSvc:      reqSvc,
		CollectionsRoot: cfg.CollectionsRoot,
		CollectionRoot:  collRoot,
		Collection:      coll,
		Flow:            flowMidRowMaxSteps,
	})
	if err != nil {
		t.Fatalf("ExecuteFlow Case E failed: %v", err)
	}
	if outE.Status != "failed" || !strings.Contains(outE.HaltedError, "max_steps") {
		t.Errorf("expected Case E failed with max_steps error, got status=%q halted=%q", outE.Status, outE.HaltedError)
	}
	if outE.StepsExecuted != 2 || outE.StepsPassed != 2 || outE.StepsSkipped != 2 {
		t.Errorf("expected Case E StepsExecuted=2, StepsPassed=2, StepsSkipped=2, got %+v", outE)
	}
	if outE.NodeResults[1].StepResults[1].Status != "skipped" {
		t.Errorf("expected 2nd parallel step in NodeResults[1] to be 'skipped', got %+v", outE.NodeResults[1].StepResults[1])
	}

	// Case F: Failing node that only has a `success` branch (matchedBranchID == "") halts the flow
	// and marks the `success` branch children and subsequent top-level nodes as "skipped"
	flowFailOnlySuccessBranch := model.Flow{
		ID:   "flow-fail-only-success-branch",
		Name: "Fail With Only Success Branch",
		Nodes: []model.FlowNode{
			{
				ID:    "n1-fail",
				Steps: []model.FlowStep{{ID: "s1-429", RequestID: r429Node.ID, Enabled: true}},
				Branches: []model.FlowBranch{
					{
						ID:        "br-only-success",
						Condition: model.FlowBranchCondition{Type: "success"},
						Nodes: []model.FlowNode{
							{ID: "n-br-child", Steps: []model.FlowStep{{ID: "s-br-child", RequestID: rOkNode.ID, Enabled: true}}},
						},
					},
				},
			},
			{
				ID:    "n2-top-after",
				Steps: []model.FlowStep{{ID: "s2-top-after", RequestID: rOkNode.ID, Enabled: true}},
			},
		},
	}
	outF, err := ExecuteFlow(FlowRunOptions{
		FS:              fs,
		CollectionSvc:   collSvc,
		RequestSvc:      reqSvc,
		CollectionsRoot: cfg.CollectionsRoot,
		CollectionRoot:  collRoot,
		Collection:      coll,
		Flow:            flowFailOnlySuccessBranch,
	})
	if err != nil {
		t.Fatalf("ExecuteFlow Case F failed: %v", err)
	}
	if outF.Status != "failed" || outF.NodeResults[0].MatchedBranchID != "" {
		t.Errorf("expected Case F failed with MatchedBranchID == '', got status=%q matched=%q", outF.Status, outF.NodeResults[0].MatchedBranchID)
	}
	if outF.StepsExecuted != 1 || outF.StepsFailed != 1 || outF.StepsSkipped != 2 {
		t.Errorf("expected Case F executed=1 failed=1 skipped=2, got %+v", outF)
	}

	// Case G: Failing node that matches an `error` branch whose child node ALSO fails halts the flow
	// and marks subsequent top-level nodes as "skipped"
	flowErrorBranchChildFails := model.Flow{
		ID:   "flow-error-branch-child-fails",
		Name: "Error Branch Child Fails",
		Nodes: []model.FlowNode{
			{
				ID:    "n1-fail",
				Steps: []model.FlowStep{{ID: "s1-429", RequestID: r429Node.ID, Enabled: true}},
				Branches: []model.FlowBranch{
					{
						ID:        "br-on-error",
						Condition: model.FlowBranchCondition{Type: "error"},
						Nodes: []model.FlowNode{
							{ID: "n-err-child-fail", Steps: []model.FlowStep{{ID: "s-err-child-fail", RequestID: r429Node.ID, Enabled: true}}},
						},
					},
				},
			},
			{
				ID:    "n2-top-after",
				Steps: []model.FlowStep{{ID: "s2-top-after", RequestID: rOkNode.ID, Enabled: true}},
			},
		},
	}
	outG, err := ExecuteFlow(FlowRunOptions{
		FS:              fs,
		CollectionSvc:   collSvc,
		RequestSvc:      reqSvc,
		CollectionsRoot: cfg.CollectionsRoot,
		CollectionRoot:  collRoot,
		Collection:      coll,
		Flow:            flowErrorBranchChildFails,
	})
	if err != nil {
		t.Fatalf("ExecuteFlow Case G failed: %v", err)
	}
	if outG.Status != "failed" || outG.NodeResults[0].MatchedBranchID != "br-on-error" {
		t.Errorf("expected Case G failed with MatchedBranchID=='br-on-error', got status=%q matched=%q", outG.Status, outG.NodeResults[0].MatchedBranchID)
	}
	if outG.StepsExecuted != 2 || outG.StepsFailed != 2 || outG.StepsSkipped != 1 {
		t.Errorf("expected Case G executed=2 failed=2 skipped=1, got %+v", outG)
	}
}

