package main

import (
	"context"
	_ "embed"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"time"

	"hecto-api/engine"
	"hecto-api/model"
	"hecto-api/service"
	"hecto-api/storage"
)

//go:embed SKILL.md
var skillMD string

var cliVersion = "dev"

const agentGuideBanner = "🤖 AI AGENT / LLM GUIDE: Run `hecto agent-guide` to print the complete SKILL.md manual (command matrix, 4-tier variables, auth inheritance, scripting, and JSON schemas) to stdout."

type multiStringFlag []string

func (m *multiStringFlag) String() string {
	return strings.Join(*m, ", ")
}

func (m *multiStringFlag) Set(val string) error {
	*m = append(*m, val)
	return nil
}

type cliContext struct {
	ctx        context.Context
	fs         *storage.FileSystem
	logger     *slog.Logger
	cfgSvc     *service.ConfigService
	collSvc    *service.CollectionService
	envSvc     *service.EnvironmentService
	reqSvc     *service.RequestService
	execSvc    *service.ExecutorService
	histSvc    *service.HistoryService
	importSvc  *service.ImporterService
	cfg        *model.AppConfig
	jsonOutput bool
	collFlag   string
	dataDir    string
}

func main() {
	os.Exit(runCLI(os.Args[1:], os.Stdout, os.Stderr))
}

func runCLI(rawArgs []string, stdout, stderr io.Writer) int {
	silentLogger := slog.New(slog.NewTextHandler(io.Discard, nil))
	slog.SetDefault(silentLogger)

	globalOpts, remaining := extractGlobalFlags(rawArgs)
	if globalOpts.err != "" {
		return emitResult(stdout, stderr, globalOpts.jsonOutput, model.NewError(model.ErrValidation, globalOpts.err))
	}

	if globalOpts.version {
		_, _ = fmt.Fprintf(stdout, "hecto v%s\n", strings.TrimPrefix(cliVersion, "v"))
		return 0
	}

	if len(remaining) == 0 || globalOpts.help {
		printMainUsage(stdout)
		return 0
	}

	topCmd := strings.ToLower(strings.TrimSpace(remaining[0]))
	cmdArgs := remaining[1:]

	if topCmd == "help" || topCmd == "--help" || topCmd == "-h" {
		printMainUsage(stdout)
		return 0
	}

	if topCmd == "version" || topCmd == "--version" || topCmd == "-v" {
		_, _ = fmt.Fprintf(stdout, "hecto v%s\n", strings.TrimPrefix(cliVersion, "v"))
		return 0
	}

	if topCmd == "agent-guide" || topCmd == "skill" {
		_, _ = fmt.Fprint(stdout, skillMD)
		return 0
	}

	fs := storage.NewFileSystem()
	cfgSvc := service.NewConfigService(fs, silentLogger)
	if globalOpts.dataDir != "" {
		cfgSvc.SetCustomConfigDir(globalOpts.dataDir)
	}
	ctx := context.Background()
	cfg, err := cfgSvc.Initialize(ctx)
	if err != nil {
		return emitResult(stdout, stderr, globalOpts.jsonOutput, model.NewError(model.ErrIO, err.Error()))
	}

	c := &cliContext{
		ctx:        ctx,
		fs:         fs,
		logger:     silentLogger,
		cfgSvc:     cfgSvc,
		collSvc:    service.NewCollectionService(fs, silentLogger),
		envSvc:     service.NewEnvironmentService(fs, silentLogger),
		reqSvc:     service.NewRequestService(fs, silentLogger),
		execSvc:    service.NewExecutorService(silentLogger),
		histSvc:    service.NewHistoryService(fs, silentLogger),
		importSvc:  service.NewImporterService(fs, silentLogger),
		cfg:        cfg,
		jsonOutput: globalOpts.jsonOutput,
		collFlag:   globalOpts.collection,
		dataDir:    globalOpts.dataDir,
	}

	var res model.Result
	switch topCmd {
	case "collection", "coll":
		res = c.handleCollection(cmdArgs)
	case "env", "environment":
		res = c.handleEnv(cmdArgs)
	case "folder", "dir":
		res = c.handleFolder(cmdArgs)
	case "req", "request":
		res = c.handleReq(cmdArgs)
	case "run", "exec":
		res = c.handleRun(cmdArgs)
	case "import":
		res = c.handleImport(cmdArgs)
	default:
		res = model.NewError(model.ErrValidation, fmt.Sprintf("unknown command %q (run `hecto --help` or `hecto agent-guide`)", topCmd))
	}

	return emitResult(stdout, stderr, c.jsonOutput, res)
}

type globalFlags struct {
	jsonOutput bool
	collection string
	dataDir    string
	help       bool
	version    bool
	err        string
}

var knownBooleanFlags = map[string]bool{
	"json":        true,
	"h":           true,
	"help":        true,
	"v":           true,
	"version":     true,
	"switch":      true,
	"activate":    true,
	"no-save-env": true,
}

func extractGlobalFlags(args []string) (globalFlags, []string) {
	var g globalFlags
	var rest []string

	for i := 0; i < len(args); i++ {
		arg := args[i]
		if arg == "--" {
			rest = append(rest, args[i:]...)
			break
		}
		switch {
		case arg == "--json":
			g.jsonOutput = true
		case strings.HasPrefix(arg, "--json="):
			val := strings.TrimPrefix(arg, "--json=")
			g.jsonOutput = val == "true" || val == "1"
		case arg == "-h" || arg == "--help":
			g.help = true
		case arg == "-v" || arg == "--version":
			g.version = true
		case arg == "-c" || arg == "--collection":
			if i+1 >= len(args) {
				g.err = fmt.Sprintf("flag needs an argument: %s", arg)
				return g, nil
			}
			g.collection = args[i+1]
			i++
		case strings.HasPrefix(arg, "--collection="):
			g.collection = strings.TrimPrefix(arg, "--collection=")
		case strings.HasPrefix(arg, "-c="):
			g.collection = strings.TrimPrefix(arg, "-c=")
		case arg == "--data-dir":
			if i+1 >= len(args) {
				g.err = "flag needs an argument: --data-dir"
				return g, nil
			}
			g.dataDir = args[i+1]
			i++
		case strings.HasPrefix(arg, "--data-dir="):
			g.dataDir = strings.TrimPrefix(arg, "--data-dir=")
		default:
			rest = append(rest, arg)
			// If this is a value-taking subcommand flag (without '='), keep its next token paired with it
			if strings.HasPrefix(arg, "-") && arg != "-" && !strings.Contains(arg, "=") {
				flagName := strings.TrimLeft(arg, "-")
				if !knownBooleanFlags[flagName] && i+1 < len(args) {
					rest = append(rest, args[i+1])
					i++
				}
			}
		}
	}
	return g, rest
}

// reorderFlagsBeforePositionals reorders flags before positional arguments so Go's standard flag.FlagSet
// parses flags placed after `<id|path>` positional arguments.
func reorderFlagsBeforePositionals(fset *flag.FlagSet, args []string) []string {
	var flagArgs []string
	var posArgs []string

	isBoolFlag := func(name string) bool {
		f := fset.Lookup(name)
		if f == nil {
			return false
		}
		if bf, ok := f.Value.(interface{ IsBoolFlag() bool }); ok {
			return bf.IsBoolFlag()
		}
		return false
	}

	for i := 0; i < len(args); i++ {
		arg := args[i]
		if arg == "--" {
			posArgs = append(posArgs, "--")
			posArgs = append(posArgs, args[i+1:]...)
			break
		}
		if strings.HasPrefix(arg, "-") && arg != "-" {
			trimmed := strings.TrimLeft(arg, "-")
			if strings.Contains(trimmed, "=") {
				flagArgs = append(flagArgs, arg)
				continue
			}
			flagArgs = append(flagArgs, arg)
			if !isBoolFlag(trimmed) && i+1 < len(args) {
				flagArgs = append(flagArgs, args[i+1])
				i++
			}
		} else {
			posArgs = append(posArgs, arg)
		}
	}
	return append(flagArgs, posArgs...)
}

func parseSubcommandFlags(fset *flag.FlagSet, args []string) ([]string, error) {
	fset.SetOutput(io.Discard)
	reordered := reorderFlagsBeforePositionals(fset, args)
	if err := fset.Parse(reordered); err != nil {
		return nil, err
	}
	return fset.Args(), nil
}

func visitedFlagsMap(fset *flag.FlagSet) map[string]bool {
	visited := map[string]bool{}
	fset.Visit(func(f *flag.Flag) {
		visited[f.Name] = true
	})
	return visited
}

func printMainUsage(w io.Writer) {
	_, _ = fmt.Fprintln(w, agentGuideBanner)
	_, _ = fmt.Fprintln(w, "")
	_, _ = fmt.Fprintln(w, "Usage:")
	_, _ = fmt.Fprintln(w, "  hecto <entity> <verb> [arguments] [flags]")
	_, _ = fmt.Fprintln(w, "  hecto run <id|path> [flags]")
	_, _ = fmt.Fprintln(w, "  hecto import <file-or-curl> [flags]")
	_, _ = fmt.Fprintln(w, "  hecto agent-guide")
	_, _ = fmt.Fprintln(w, "")
	_, _ = fmt.Fprintln(w, "Entities & Verbs:")
	_, _ = fmt.Fprintln(w, "  collection  list | get | create | update | delete | switch")
	_, _ = fmt.Fprintln(w, "  env         list | get | create | update | delete | activate")
	_, _ = fmt.Fprintln(w, "  folder      list | tree | get | create | update | delete | move")
	_, _ = fmt.Fprintln(w, "  req         list | get | create | update | delete | move")
	_, _ = fmt.Fprintln(w, "")
	_, _ = fmt.Fprintln(w, "Top-Level Commands:")
	_, _ = fmt.Fprintln(w, "  run         Execute a request through the shared TypeScript/goja engine")
	_, _ = fmt.Fprintln(w, "  import      Import a Postman v2.1 JSON file or a raw cURL command/file")
	_, _ = fmt.Fprintln(w, "  agent-guide Print the complete SKILL.md manual for AI Coding Agents")
	_, _ = fmt.Fprintln(w, "")
	_, _ = fmt.Fprintln(w, "Global Flags:")
	_, _ = fmt.Fprintln(w, "  -c, --collection <id|name>  Target collection (defaults to active_collection)")
	_, _ = fmt.Fprintln(w, "  --data-dir <path>           Override config and collections root directory")
	_, _ = fmt.Fprintln(w, "  --json                      Output canonical model.Result JSON to stdout")
	_, _ = fmt.Fprintln(w, "  -h, --help                  Show this help message")
}

func emitResult(stdout, stderr io.Writer, jsonMode bool, res model.Result) int {
	if jsonMode {
		enc := json.NewEncoder(stdout)
		enc.SetEscapeHTML(false)
		_ = enc.Encode(res)
		if !res.Success {
			return 1
		}
		return 0
	}

	if !res.Success {
		if res.Error != nil {
			_, _ = fmt.Fprintf(stderr, "Error [%s]: %s\n", res.Error.Code, res.Error.Message)
		} else {
			_, _ = fmt.Fprintln(stderr, "Error: operation failed")
		}
		return 1
	}

	if res.Data != nil {
		raw, err := json.MarshalIndent(res.Data, "", "  ")
		if err == nil {
			_, _ = fmt.Fprintln(stdout, string(raw))
		}
	} else {
		_, _ = fmt.Fprintln(stdout, "OK")
	}
	return 0
}

func resultFromError(err error) model.Result {
	if err == nil {
		return model.NewSuccess(nil)
	}
	msg := err.Error()
	for _, code := range []string{
		model.ErrNotFound,
		model.ErrValidation,
		model.ErrIO,
		model.ErrParse,
		model.ErrConnection,
		model.ErrTimeout,
	} {
		prefix := code + ": "
		if strings.HasPrefix(msg, prefix) {
			return model.NewError(code, strings.TrimPrefix(msg, prefix))
		}
	}
	return model.NewError(model.ErrValidation, msg)
}

func (c *cliContext) resolveTargetCollection(overrideSelector string) (model.Collection, string, error) {
	sel := strings.TrimSpace(overrideSelector)
	if sel == "" {
		sel = strings.TrimSpace(c.collFlag)
	}
	coll, collRoot, err := c.collSvc.ResolveCollectionSelector(c.cfg.CollectionsRoot, c.cfg.ActiveCollection, sel)
	if err != nil {
		return model.Collection{}, "", err
	}
	c.fs.SetCollectionRoot(collRoot)
	return coll, collRoot, nil
}

func parseKeyValueFlag(raw string, sep string) (string, string, error) {
	idx := strings.Index(raw, sep)
	if idx < 0 {
		return "", "", fmt.Errorf("%s: expected key%svalue format, got %q", model.ErrValidation, sep, raw)
	}
	k := strings.TrimSpace(raw[:idx])
	v := raw[idx+len(sep):]
	if sep == ":" {
		v = strings.TrimSpace(v)
	}
	if k == "" {
		return "", "", fmt.Errorf("%s: empty key in %q", model.ErrValidation, raw)
	}
	return k, v, nil
}

func parseHeaderFlag(raw string) (string, string, error) {
	if strings.Contains(raw, ":") {
		return parseKeyValueFlag(raw, ":")
	}
	if strings.Contains(raw, "=") {
		return parseKeyValueFlag(raw, "=")
	}
	return "", "", fmt.Errorf("%s: expected Header 'Key: Value' or 'Key=Value', got %q", model.ErrValidation, raw)
}

func upsertKVPair(list []model.KVPair, key, val string) []model.KVPair {
	if list == nil {
		list = []model.KVPair{}
	}
	for i := range list {
		if list[i].Key == key {
			list[i].Value = val
			list[i].Enabled = true
			return list
		}
	}
	return append(list, model.KVPair{Key: key, Value: val, Enabled: true})
}

func removeKVPair(list []model.KVPair, key string) []model.KVPair {
	if len(list) == 0 {
		return []model.KVPair{}
	}
	out := make([]model.KVPair, 0, len(list))
	for _, item := range list {
		if item.Key != key {
			out = append(out, item)
		}
	}
	return out
}

func normalizeAuthType(raw string, allowInherit bool) (string, error) {
	lower := strings.ToLower(strings.TrimSpace(raw))
	switch lower {
	case "none":
		return "none", nil
	case "inherit":
		if !allowInherit {
			return "", fmt.Errorf("%s: auth type 'inherit' is not valid at collection level", model.ErrValidation)
		}
		return "inherit", nil
	case "bearer":
		return "bearer", nil
	case "basic":
		return "basic", nil
	case "apikey", "api-key", "api_key":
		return "apiKey", nil
	default:
		return "", fmt.Errorf("%s: invalid --auth-type %q (expected none, inherit, bearer, basic, or apiKey)", model.ErrValidation, raw)
	}
}

func normalizeAuthIn(raw string) (string, error) {
	trimmed := strings.ToLower(strings.TrimSpace(raw))
	if trimmed == "" || trimmed == "header" {
		return "header", nil
	}
	if trimmed == "query" {
		return "query", nil
	}
	return "", fmt.Errorf("%s: invalid --auth-in %q (expected header or query)", model.ErrValidation, raw)
}

type authFlags struct {
	authType  string
	authToken string
	authUser  string
	authPass  string
	authKey   string
	authVal   string
	authIn    string
}

func registerAuthFlags(fset *flag.FlagSet, af *authFlags) {
	fset.StringVar(&af.authType, "auth-type", "", "Auth type (inherit|none|bearer|basic|apiKey)")
	fset.StringVar(&af.authToken, "auth-token", "", "Bearer token")
	fset.StringVar(&af.authUser, "auth-user", "", "Basic auth username")
	fset.StringVar(&af.authPass, "auth-pass", "", "Basic auth password")
	fset.StringVar(&af.authKey, "auth-key", "", "API Key name")
	fset.StringVar(&af.authVal, "auth-val", "", "API Key value")
	fset.StringVar(&af.authIn, "auth-in", "header", "API Key location (header|query)")
}

func applyAuthFlags(existing *model.AuthConfig, af authFlags, visited map[string]bool, allowInherit bool, defaultType string, hasEnvAuths bool) (*model.AuthConfig, bool, error) {
	anyAuthVisited := visited["auth-type"] || visited["auth-token"] || visited["auth-user"] ||
		visited["auth-pass"] || visited["auth-key"] || visited["auth-val"] || visited["auth-in"]
	// If --env-auth was specified without --auth-type, credential flags belong to --env-auth, not entity-level Auth
	if !anyAuthVisited || (hasEnvAuths && !visited["auth-type"]) {
		if existing != nil {
			return existing, false, nil
		}
		if defaultType != "" {
			return &model.AuthConfig{Type: defaultType}, false, nil
		}
		return nil, false, nil
	}

	cfg := &model.AuthConfig{Type: defaultType}
	if existing != nil {
		cp := *existing
		cfg = &cp
	}

	if visited["auth-type"] {
		normType, err := normalizeAuthType(af.authType, allowInherit)
		if err != nil {
			return nil, false, err
		}
		cfg.Type = normType
	} else if cfg.Type == "" || cfg.Type == "none" || cfg.Type == "inherit" {
		// Infer auth type if specific credential flags were passed without --auth-type
		switch {
		case visited["auth-token"]:
			cfg.Type = "bearer"
		case visited["auth-user"] || visited["auth-pass"]:
			cfg.Type = "basic"
		case visited["auth-key"] || visited["auth-val"]:
			cfg.Type = "apiKey"
		}
	}

	switch cfg.Type {
	case "none", "inherit":
		cfg.Bearer = nil
		cfg.Basic = nil
		cfg.APIKey = nil
	case "bearer":
		cfg.Basic = nil
		cfg.APIKey = nil
		if cfg.Bearer == nil {
			cfg.Bearer = &model.BearerAuth{}
		}
		if visited["auth-token"] {
			cfg.Bearer.Token = af.authToken
		}
	case "basic":
		cfg.Bearer = nil
		cfg.APIKey = nil
		if cfg.Basic == nil {
			cfg.Basic = &model.BasicAuth{}
		}
		if visited["auth-user"] {
			cfg.Basic.Username = af.authUser
		}
		if visited["auth-pass"] {
			cfg.Basic.Password = af.authPass
		}
	case "apiKey":
		cfg.Bearer = nil
		cfg.Basic = nil
		if cfg.APIKey == nil {
			cfg.APIKey = &model.APIKeyAuth{AddTo: "header"}
		}
		if visited["auth-key"] {
			cfg.APIKey.Key = af.authKey
		}
		if visited["auth-val"] {
			cfg.APIKey.Value = af.authVal
		}
		if visited["auth-in"] || cfg.APIKey.AddTo == "" {
			addTo, err := normalizeAuthIn(af.authIn)
			if err != nil {
				return nil, false, err
			}
			cfg.APIKey.AddTo = addTo
		}
	}

	return cfg, true, nil
}

// parseEnvAuthSpec parses `--env-auth <env>:<type>[:arg1[:arg2[:arg3]]]`
func (c *cliContext) parseEnvAuthSpec(collRoot string, spec string, af authFlags, allowInherit bool) (string, *model.AuthConfig, error) {
	parts := strings.Split(spec, ":")
	if len(parts) < 2 {
		return "", nil, fmt.Errorf("%s: invalid --env-auth %q (expected <env>:<type>[:...])", model.ErrValidation, spec)
	}
	envSel := strings.TrimSpace(parts[0])
	envObj, err := c.collSvc.ResolveEnvironmentSelector(collRoot, envSel)
	if err != nil {
		return "", nil, err
	}
	normType, err := normalizeAuthType(parts[1], allowInherit)
	if err != nil {
		return "", nil, err
	}
	authCfg := &model.AuthConfig{Type: normType}
	switch normType {
	case "bearer":
		tok := af.authToken
		if len(parts) >= 3 {
			tok = strings.Join(parts[2:], ":")
		}
		authCfg.Bearer = &model.BearerAuth{Token: tok}
	case "basic":
		u, p := af.authUser, af.authPass
		if len(parts) >= 3 {
			u = parts[2]
		}
		if len(parts) >= 4 {
			p = strings.Join(parts[3:], ":")
		}
		authCfg.Basic = &model.BasicAuth{Username: u, Password: p}
	case "apiKey":
		k, v, in := af.authKey, af.authVal, af.authIn
		if len(parts) >= 3 {
			k = parts[2]
		}
		if len(parts) >= 4 {
			v = parts[3]
		}
		if len(parts) >= 5 {
			in = parts[4]
		}
		normIn, err := normalizeAuthIn(in)
		if err != nil {
			return "", nil, err
		}
		authCfg.APIKey = &model.APIKeyAuth{Key: k, Value: v, AddTo: normIn}
	}
	return envObj.ID, authCfg, nil
}

func readStringOrFileFlag(raw string) (string, error) {
	if strings.HasPrefix(raw, "@") && len(raw) > 1 {
		filePath := raw[1:]
		b, err := os.ReadFile(filePath)
		if err != nil {
			if os.IsNotExist(err) {
				return "", fmt.Errorf("%s: file %s does not exist", model.ErrNotFound, filePath)
			}
			return "", fmt.Errorf("%s: %v", model.ErrIO, err)
		}
		return string(b), nil
	}
	return raw, nil
}

// ============================================================================
// 1. COLLECTION COMMANDS
// ============================================================================

func (c *cliContext) handleCollection(args []string) model.Result {
	if len(args) == 0 {
		return model.NewError(model.ErrValidation, "missing collection verb (expected: list|get|create|update|delete|switch)")
	}
	verb := strings.ToLower(strings.TrimSpace(args[0]))
	rest := args[1:]

	switch verb {
	case "list", "ls":
		fset := flag.NewFlagSet("collection list", flag.ContinueOnError)
		if _, err := parseSubcommandFlags(fset, rest); err != nil {
			return model.NewError(model.ErrValidation, err.Error())
		}
		return c.collSvc.ListCollections(c.cfg.CollectionsRoot, c.cfg.ActiveCollection)

	case "get", "show":
		fset := flag.NewFlagSet("collection get", flag.ContinueOnError)
		pos, err := parseSubcommandFlags(fset, rest)
		if err != nil {
			return model.NewError(model.ErrValidation, err.Error())
		}
		sel := ""
		if len(pos) > 0 {
			sel = pos[0]
		}
		coll, _, err := c.resolveTargetCollection(sel)
		if err != nil {
			return resultFromError(err)
		}
		return model.NewSuccess(coll)

	case "create", "add":
		fset := flag.NewFlagSet("collection create", flag.ContinueOnError)
		var name, desc string
		var vars multiStringFlag
		var envAuths multiStringFlag
		var switchActive bool
		var af authFlags
		fset.StringVar(&name, "name", "", "Collection name")
		fset.StringVar(&desc, "description", "", "Collection description")
		fset.Var(&vars, "var", "Collection variable K=V")
		fset.Var(&envAuths, "env-auth", "Environment auth <env>:<type>")
		fset.BoolVar(&switchActive, "switch", false, "Switch active_collection to the new collection")
		registerAuthFlags(fset, &af)

		pos, err := parseSubcommandFlags(fset, rest)
		if err != nil {
			return model.NewError(model.ErrValidation, err.Error())
		}
		if strings.TrimSpace(name) == "" && len(pos) > 0 {
			name = pos[0]
		}
		if strings.TrimSpace(name) == "" {
			return model.NewError(model.ErrValidation, "--name is required for `collection create`")
		}
		visited := visitedFlagsMap(fset)

		// Validate all flags before creating collection on disk
		parsedVars := []model.KVPair{}
		for _, vRaw := range vars {
			k, v, err := parseKeyValueFlag(vRaw, "=")
			if err != nil {
				return resultFromError(err)
			}
			parsedVars = upsertKVPair(parsedVars, k, v)
		}
		authCfg, authChanged, err := applyAuthFlags(nil, af, visited, false, "none", len(envAuths) > 0)
		if err != nil {
			return resultFromError(err)
		}

		createRes := c.collSvc.CreateCollection(c.cfg.CollectionsRoot, name)
		if !createRes.Success {
			return createRes
		}
		created, _ := createRes.Data.(model.Collection)
		collRoot := filepath.Join(c.cfg.CollectionsRoot, created.ID)
		c.fs.SetCollectionRoot(collRoot)

		created.Description = desc
		created.Variables = parsedVars
		if authChanged {
			created.Auth = authCfg
		}
		if len(envAuths) > 0 {
			if created.AuthEnvs == nil {
				created.AuthEnvs = map[string]*model.AuthConfig{}
			}
			for _, spec := range envAuths {
				envID, aCfg, err := c.parseEnvAuthSpec(collRoot, spec, af, false)
				if err != nil {
					_ = c.collSvc.DeleteCollection(c.cfg.CollectionsRoot, created.ID)
					return resultFromError(err)
				}
				created.AuthEnvs[envID] = aCfg
			}
		}

		if visited["description"] || len(vars) > 0 || authChanged || len(envAuths) > 0 {
			updRes := c.collSvc.UpdateCollection(c.cfg.CollectionsRoot, created)
			if !updRes.Success {
				return updRes
			}
			if updColl, ok := updRes.Data.(model.Collection); ok {
				created = updColl
			}
		}

		if switchActive {
			if _, err := c.cfgSvc.SwitchActiveCollection(c.ctx, created.ID); err != nil {
				return model.NewError(model.ErrIO, err.Error())
			}
			c.cfg.ActiveCollection = created.ID
		}
		return model.NewSuccess(created)

	case "update", "patch":
		fset := flag.NewFlagSet("collection update", flag.ContinueOnError)
		var name, desc, activeEnv string
		var setVars, unsetVars, envAuths multiStringFlag
		var af authFlags
		fset.StringVar(&name, "name", "", "New collection name")
		fset.StringVar(&desc, "description", "", "Collection description")
		fset.Var(&setVars, "set-var", "Set collection variable K=V")
		fset.Var(&unsetVars, "unset-var", "Unset collection variable K")
		fset.Var(&envAuths, "env-auth", "Set collection env auth <env>:<type>")
		fset.StringVar(&activeEnv, "active-env", "", "Set active environment <id|name|none>")
		registerAuthFlags(fset, &af)

		pos, err := parseSubcommandFlags(fset, rest)
		if err != nil {
			return model.NewError(model.ErrValidation, err.Error())
		}
		sel := ""
		if len(pos) > 0 {
			sel = pos[0]
		}
		coll, collRoot, err := c.resolveTargetCollection(sel)
		if err != nil {
			return resultFromError(err)
		}
		visited := visitedFlagsMap(fset)

		if visited["name"] {
			if strings.TrimSpace(name) == "" {
				return model.NewError(model.ErrValidation, "collection name cannot be empty")
			}
			coll.Name = strings.TrimSpace(name)
		}
		if visited["description"] {
			coll.Description = desc
		}
		for _, kvRaw := range setVars {
			k, v, err := parseKeyValueFlag(kvRaw, "=")
			if err != nil {
				return resultFromError(err)
			}
			coll.Variables = upsertKVPair(coll.Variables, k, v)
		}
		for _, k := range unsetVars {
			coll.Variables = removeKVPair(coll.Variables, strings.TrimSpace(k))
		}
		authCfg, authChanged, err := applyAuthFlags(coll.Auth, af, visited, false, "none", len(envAuths) > 0)
		if err != nil {
			return resultFromError(err)
		}
		if authChanged {
			coll.Auth = authCfg
		}
		if len(envAuths) > 0 {
			if coll.AuthEnvs == nil {
				coll.AuthEnvs = map[string]*model.AuthConfig{}
			}
			for _, spec := range envAuths {
				envID, aCfg, err := c.parseEnvAuthSpec(collRoot, spec, af, false)
				if err != nil {
					return resultFromError(err)
				}
				coll.AuthEnvs[envID] = aCfg
			}
		}
		if visited["active-env"] {
			trimmedEnv := strings.TrimSpace(activeEnv)
			if trimmedEnv == "" || strings.EqualFold(trimmedEnv, "none") {
				coll.ActiveEnvID = ""
			} else {
				envObj, err := c.collSvc.ResolveEnvironmentSelector(collRoot, trimmedEnv)
				if err != nil {
					return resultFromError(err)
				}
				coll.ActiveEnvID = envObj.ID
			}
		}

		return c.collSvc.UpdateCollection(c.cfg.CollectionsRoot, coll)

	case "delete", "rm":
		fset := flag.NewFlagSet("collection delete", flag.ContinueOnError)
		pos, err := parseSubcommandFlags(fset, rest)
		if err != nil {
			return model.NewError(model.ErrValidation, err.Error())
		}
		if len(pos) == 0 {
			return model.NewError(model.ErrValidation, "collection selector <id|name> is required")
		}
		coll, _, err := c.collSvc.ResolveCollectionSelector(c.cfg.CollectionsRoot, c.cfg.ActiveCollection, pos[0])
		if err != nil {
			return resultFromError(err)
		}
		delRes := c.collSvc.DeleteCollection(c.cfg.CollectionsRoot, coll.ID)
		if !delRes.Success {
			return delRes
		}
		if coll.ID == c.cfg.ActiveCollection {
			if _, err := c.cfgSvc.SwitchActiveCollection(c.ctx, "default"); err != nil {
				return model.NewError(model.ErrIO, err.Error())
			}
			c.cfg.ActiveCollection = "default"
		}
		return model.NewSuccess(map[string]interface{}{
			"deleted_id":        coll.ID,
			"active_collection": c.cfg.ActiveCollection,
		})

	case "switch", "use":
		fset := flag.NewFlagSet("collection switch", flag.ContinueOnError)
		pos, err := parseSubcommandFlags(fset, rest)
		if err != nil {
			return model.NewError(model.ErrValidation, err.Error())
		}
		if len(pos) == 0 {
			return model.NewError(model.ErrValidation, "collection selector <id|name> is required")
		}
		coll, _, err := c.collSvc.ResolveCollectionSelector(c.cfg.CollectionsRoot, c.cfg.ActiveCollection, pos[0])
		if err != nil {
			return resultFromError(err)
		}
		if _, err := c.cfgSvc.SwitchActiveCollection(c.ctx, coll.ID); err != nil {
			return model.NewError(model.ErrIO, err.Error())
		}
		c.cfg.ActiveCollection = coll.ID
		return model.NewSuccess(map[string]interface{}{
			"active_collection": coll.ID,
			"name":              coll.Name,
		})

	default:
		return model.NewError(model.ErrValidation, fmt.Sprintf("unknown collection verb %q (expected: list|get|create|update|delete|switch)", verb))
	}
}

// ============================================================================
// 2. ENVIRONMENT COMMANDS
// ============================================================================

func (c *cliContext) handleEnv(args []string) model.Result {
	if len(args) == 0 {
		return model.NewError(model.ErrValidation, "missing env verb (expected: list|get|create|update|delete|activate)")
	}
	verb := strings.ToLower(strings.TrimSpace(args[0]))
	rest := args[1:]

	coll, collRoot, err := c.resolveTargetCollection("")
	if err != nil {
		return resultFromError(err)
	}

	switch verb {
	case "list", "ls":
		fset := flag.NewFlagSet("env list", flag.ContinueOnError)
		if _, err := parseSubcommandFlags(fset, rest); err != nil {
			return model.NewError(model.ErrValidation, err.Error())
		}
		return c.envSvc.List(collRoot)

	case "get", "show":
		fset := flag.NewFlagSet("env get", flag.ContinueOnError)
		pos, err := parseSubcommandFlags(fset, rest)
		if err != nil {
			return model.NewError(model.ErrValidation, err.Error())
		}
		if len(pos) == 0 {
			return model.NewError(model.ErrValidation, "environment selector <id|name> is required")
		}
		envObj, err := c.collSvc.ResolveEnvironmentSelector(collRoot, pos[0])
		if err != nil {
			return resultFromError(err)
		}
		return model.NewSuccess(*envObj)

	case "create", "add":
		fset := flag.NewFlagSet("env create", flag.ContinueOnError)
		var name string
		var vars multiStringFlag
		var activate bool
		fset.StringVar(&name, "name", "", "Environment name")
		fset.Var(&vars, "var", "Variable K=V")
		fset.BoolVar(&activate, "activate", false, "Set as active environment for the collection")

		pos, err := parseSubcommandFlags(fset, rest)
		if err != nil {
			return model.NewError(model.ErrValidation, err.Error())
		}
		if strings.TrimSpace(name) == "" && len(pos) > 0 {
			name = pos[0]
		}
		if strings.TrimSpace(name) == "" {
			return model.NewError(model.ErrValidation, "--name is required for `env create`")
		}

		kvList := []model.KVPair{}
		for _, vRaw := range vars {
			k, v, err := parseKeyValueFlag(vRaw, "=")
			if err != nil {
				return resultFromError(err)
			}
			kvList = upsertKVPair(kvList, k, v)
		}

		saveRes := c.envSvc.Save(collRoot, model.Environment{
			Name:      strings.TrimSpace(name),
			Variables: kvList,
		})
		if !saveRes.Success {
			return saveRes
		}
		createdEnv, _ := saveRes.Data.(model.Environment)
		if activate {
			coll.ActiveEnvID = createdEnv.ID
			updRes := c.collSvc.UpdateCollection(c.cfg.CollectionsRoot, coll)
			if !updRes.Success {
				return updRes
			}
		}
		return model.NewSuccess(createdEnv)

	case "update", "patch":
		fset := flag.NewFlagSet("env update", flag.ContinueOnError)
		var name string
		var setVars, unsetVars multiStringFlag
		fset.StringVar(&name, "name", "", "New environment name")
		fset.Var(&setVars, "set-var", "Set variable K=V")
		fset.Var(&unsetVars, "unset-var", "Unset variable K")

		pos, err := parseSubcommandFlags(fset, rest)
		if err != nil {
			return model.NewError(model.ErrValidation, err.Error())
		}
		if len(pos) == 0 {
			return model.NewError(model.ErrValidation, "environment selector <id|name> is required")
		}
		envObj, err := c.collSvc.ResolveEnvironmentSelector(collRoot, pos[0])
		if err != nil {
			return resultFromError(err)
		}
		visited := visitedFlagsMap(fset)
		if visited["name"] {
			if strings.TrimSpace(name) == "" {
				return model.NewError(model.ErrValidation, "environment name cannot be empty")
			}
			envObj.Name = strings.TrimSpace(name)
		}
		for _, kvRaw := range setVars {
			k, v, err := parseKeyValueFlag(kvRaw, "=")
			if err != nil {
				return resultFromError(err)
			}
			envObj.Variables = upsertKVPair(envObj.Variables, k, v)
		}
		for _, k := range unsetVars {
			envObj.Variables = removeKVPair(envObj.Variables, strings.TrimSpace(k))
		}
		return c.envSvc.Save(collRoot, *envObj)

	case "delete", "rm":
		fset := flag.NewFlagSet("env delete", flag.ContinueOnError)
		pos, err := parseSubcommandFlags(fset, rest)
		if err != nil {
			return model.NewError(model.ErrValidation, err.Error())
		}
		if len(pos) == 0 {
			return model.NewError(model.ErrValidation, "environment selector <id|name> is required")
		}
		envObj, err := c.collSvc.ResolveEnvironmentSelector(collRoot, pos[0])
		if err != nil {
			return resultFromError(err)
		}
		delRes := c.envSvc.Delete(collRoot, envObj.ID)
		if !delRes.Success {
			return delRes
		}
		// If the deleted environment was the active_env_id of the collection, clear it in collection.json
		if coll.ActiveEnvID == envObj.ID {
			coll.ActiveEnvID = ""
			updRes := c.collSvc.UpdateCollection(c.cfg.CollectionsRoot, coll)
			if !updRes.Success {
				return updRes
			}
		}
		return model.NewSuccess(map[string]interface{}{
			"deleted_id":    envObj.ID,
			"active_env_id": coll.ActiveEnvID,
		})

	case "activate", "use":
		fset := flag.NewFlagSet("env activate", flag.ContinueOnError)
		pos, err := parseSubcommandFlags(fset, rest)
		if err != nil {
			return model.NewError(model.ErrValidation, err.Error())
		}
		if len(pos) == 0 {
			return model.NewError(model.ErrValidation, "environment selector <id|name|none> is required")
		}
		sel := strings.TrimSpace(pos[0])
		if sel == "" || strings.EqualFold(sel, "none") {
			coll.ActiveEnvID = ""
		} else {
			envObj, err := c.collSvc.ResolveEnvironmentSelector(collRoot, sel)
			if err != nil {
				return resultFromError(err)
			}
			coll.ActiveEnvID = envObj.ID
		}
		updRes := c.collSvc.UpdateCollection(c.cfg.CollectionsRoot, coll)
		if !updRes.Success {
			return updRes
		}
		return model.NewSuccess(map[string]interface{}{
			"collection_id": coll.ID,
			"active_env_id": coll.ActiveEnvID,
		})

	default:
		return model.NewError(model.ErrValidation, fmt.Sprintf("unknown env verb %q (expected: list|get|create|update|delete|activate)", verb))
	}
}

// ============================================================================
// 3. FOLDER COMMANDS
// ============================================================================

type folderListEntry struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	PathDisplay string `json:"path_display"`
}

func flattenFolderList(nodes []model.TreeNode, prefix string) []folderListEntry {
	out := []folderListEntry{}
	for _, n := range nodes {
		if n.Type == "folder" {
			p := n.Name
			if prefix != "" {
				p = prefix + "/" + n.Name
			}
			out = append(out, folderListEntry{
				ID:          n.ID,
				Name:        n.Name,
				PathDisplay: p,
			})
			if len(n.Children) > 0 {
				out = append(out, flattenFolderList(n.Children, p)...)
			}
		}
	}
	return out
}

func (c *cliContext) parseEnvScopedVarSpec(collRoot, spec string, requireValue bool) (string, string, string, error) {
	colonIdx := strings.Index(spec, ":")
	if colonIdx <= 0 {
		return "", "", "", fmt.Errorf("%s: expected <env>:<key>=<value> format, got %q", model.ErrValidation, spec)
	}
	envSel := strings.TrimSpace(spec[:colonIdx])
	rest := spec[colonIdx+1:]
	envObj, err := c.collSvc.ResolveEnvironmentSelector(collRoot, envSel)
	if err != nil {
		return "", "", "", err
	}
	if !requireValue {
		key := strings.TrimSpace(rest)
		if key == "" {
			return "", "", "", fmt.Errorf("%s: empty variable key in %q", model.ErrValidation, spec)
		}
		return envObj.ID, key, "", nil
	}
	k, v, err := parseKeyValueFlag(rest, "=")
	if err != nil {
		return "", "", "", err
	}
	return envObj.ID, k, v, nil
}

func (c *cliContext) handleFolder(args []string) model.Result {
	if len(args) == 0 {
		return model.NewError(model.ErrValidation, "missing folder verb (expected: list|tree|get|create|update|delete|move)")
	}
	verb := strings.ToLower(strings.TrimSpace(args[0]))
	rest := args[1:]

	_, collRoot, err := c.resolveTargetCollection("")
	if err != nil {
		return resultFromError(err)
	}

	switch verb {
	case "tree":
		fset := flag.NewFlagSet("folder tree", flag.ContinueOnError)
		if _, err := parseSubcommandFlags(fset, rest); err != nil {
			return model.NewError(model.ErrValidation, err.Error())
		}
		return c.collSvc.GetTree(collRoot)

	case "list", "ls":
		fset := flag.NewFlagSet("folder list", flag.ContinueOnError)
		if _, err := parseSubcommandFlags(fset, rest); err != nil {
			return model.NewError(model.ErrValidation, err.Error())
		}
		treeRes := c.collSvc.GetTree(collRoot)
		if !treeRes.Success {
			return treeRes
		}
		nodes, _ := treeRes.Data.([]model.TreeNode)
		return model.NewSuccess(flattenFolderList(nodes, ""))

	case "get", "show":
		fset := flag.NewFlagSet("folder get", flag.ContinueOnError)
		pos, err := parseSubcommandFlags(fset, rest)
		if err != nil {
			return model.NewError(model.ErrValidation, err.Error())
		}
		if len(pos) == 0 {
			return model.NewError(model.ErrValidation, "folder selector <id|path> is required")
		}
		node, _, err := c.collSvc.ResolveFolderSelector(collRoot, pos[0])
		if err != nil {
			return resultFromError(err)
		}
		return c.collSvc.LoadFolder(node.ID)

	case "create", "add":
		fset := flag.NewFlagSet("folder create", flag.ContinueOnError)
		var name, parentSel string
		var vars, envVars, headers, envAuths multiStringFlag
		var af authFlags
		fset.StringVar(&name, "name", "", "Folder name")
		fset.StringVar(&parentSel, "parent", "", "Parent folder <id|path>")
		fset.Var(&vars, "var", "Folder variable K=V (Tier 3)")
		fset.Var(&envVars, "env-var", "Folder environment variable <env>:<K>=<V> (Tier 4)")
		fset.Var(&headers, "header", "Folder inherited header 'K: V'")
		fset.Var(&envAuths, "env-auth", "Folder environment auth <env>:<type>")
		registerAuthFlags(fset, &af)

		pos, err := parseSubcommandFlags(fset, rest)
		if err != nil {
			return model.NewError(model.ErrValidation, err.Error())
		}
		if strings.TrimSpace(name) == "" && len(pos) > 0 {
			name = pos[0]
		}
		if strings.TrimSpace(name) == "" {
			return model.NewError(model.ErrValidation, "--name is required for `folder create`")
		}
		visited := visitedFlagsMap(fset)

		parentID := ""
		trimmedParent := strings.TrimSpace(parentSel)
		if trimmedParent != "" && !strings.EqualFold(trimmedParent, "root") && trimmedParent != "/" {
			pNode, _, err := c.collSvc.ResolveFolderSelector(collRoot, trimmedParent)
			if err != nil {
				return resultFromError(err)
			}
			parentID = pNode.ID
		}

		// Validate all flags before creating folder on disk
		parsedVars := []model.KVPair{}
		for _, kvRaw := range vars {
			k, v, err := parseKeyValueFlag(kvRaw, "=")
			if err != nil {
				return resultFromError(err)
			}
			parsedVars = upsertKVPair(parsedVars, k, v)
		}
		var parsedFolderEnvs map[string][]model.KVPair
		for _, spec := range envVars {
			envID, k, v, err := c.parseEnvScopedVarSpec(collRoot, spec, true)
			if err != nil {
				return resultFromError(err)
			}
			if parsedFolderEnvs == nil {
				parsedFolderEnvs = map[string][]model.KVPair{}
			}
			parsedFolderEnvs[envID] = upsertKVPair(parsedFolderEnvs[envID], k, v)
		}
		parsedHeaders := []model.KVPair{}
		for _, hRaw := range headers {
			k, v, err := parseHeaderFlag(hRaw)
			if err != nil {
				return resultFromError(err)
			}
			parsedHeaders = upsertKVPair(parsedHeaders, k, v)
		}
		authCfg, _, err := applyAuthFlags(nil, af, visited, true, "inherit", len(envAuths) > 0)
		if err != nil {
			return resultFromError(err)
		}
		var parsedAuthEnvs map[string]*model.AuthConfig
		if len(envAuths) > 0 {
			parsedAuthEnvs = map[string]*model.AuthConfig{}
			for _, spec := range envAuths {
				envID, aCfg, err := c.parseEnvAuthSpec(collRoot, spec, af, true)
				if err != nil {
					return resultFromError(err)
				}
				parsedAuthEnvs[envID] = aCfg
			}
		}

		createRes := c.collSvc.CreateFolder(collRoot, parentID)
		if !createRes.Success {
			return createRes
		}
		createdNode, _ := createRes.Data.(model.TreeNode)
		if renRes := c.collSvc.RenameFolder(createdNode.ID, strings.TrimSpace(name)); !renRes.Success {
			_ = c.collSvc.DeleteFolder(collRoot, createdNode.ID)
			return renRes
		}
		loadRes := c.collSvc.LoadFolder(createdNode.ID)
		if !loadRes.Success {
			return loadRes
		}
		folder, _ := loadRes.Data.(model.Folder)
		folder.Variables = parsedVars
		if parsedFolderEnvs != nil {
			folder.FolderEnvs = parsedFolderEnvs
		}
		folder.Headers = parsedHeaders
		folder.Auth = authCfg
		if parsedAuthEnvs != nil {
			folder.AuthEnvs = parsedAuthEnvs
		}

		if updRes := c.collSvc.UpdateFolder(folder); !updRes.Success {
			return updRes
		}
		return c.collSvc.LoadFolder(folder.ID)

	case "update", "patch":
		fset := flag.NewFlagSet("folder update", flag.ContinueOnError)
		var name string
		var setVars, unsetVars, setEnvVars, unsetEnvVars, setHeaders, unsetHeaders, envAuths multiStringFlag
		var af authFlags
		fset.StringVar(&name, "name", "", "New folder name")
		fset.Var(&setVars, "set-var", "Set folder variable K=V")
		fset.Var(&unsetVars, "unset-var", "Unset folder variable K")
		fset.Var(&setEnvVars, "set-env-var", "Set folder env variable <env>:<K>=<V>")
		fset.Var(&unsetEnvVars, "unset-env-var", "Unset folder env variable <env>:<K>")
		fset.Var(&setHeaders, "set-header", "Set folder header 'K: V'")
		fset.Var(&unsetHeaders, "unset-header", "Unset folder header K")
		fset.Var(&envAuths, "env-auth", "Set folder env auth <env>:<type>")
		registerAuthFlags(fset, &af)

		pos, err := parseSubcommandFlags(fset, rest)
		if err != nil {
			return model.NewError(model.ErrValidation, err.Error())
		}
		if len(pos) == 0 {
			return model.NewError(model.ErrValidation, "folder selector <id|path> is required")
		}
		node, _, err := c.collSvc.ResolveFolderSelector(collRoot, pos[0])
		if err != nil {
			return resultFromError(err)
		}
		visited := visitedFlagsMap(fset)
		if visited["name"] && strings.TrimSpace(name) == "" {
			return model.NewError(model.ErrValidation, "folder name cannot be empty")
		}
		loadRes := c.collSvc.LoadFolder(node.ID)
		if !loadRes.Success {
			return loadRes
		}
		folder, _ := loadRes.Data.(model.Folder)
		for _, kvRaw := range setVars {
			k, v, err := parseKeyValueFlag(kvRaw, "=")
			if err != nil {
				return resultFromError(err)
			}
			folder.Variables = upsertKVPair(folder.Variables, k, v)
		}
		for _, k := range unsetVars {
			folder.Variables = removeKVPair(folder.Variables, strings.TrimSpace(k))
		}
		for _, spec := range setEnvVars {
			envID, k, v, err := c.parseEnvScopedVarSpec(collRoot, spec, true)
			if err != nil {
				return resultFromError(err)
			}
			if folder.FolderEnvs == nil {
				folder.FolderEnvs = map[string][]model.KVPair{}
			}
			folder.FolderEnvs[envID] = upsertKVPair(folder.FolderEnvs[envID], k, v)
		}
		for _, spec := range unsetEnvVars {
			envID, k, _, err := c.parseEnvScopedVarSpec(collRoot, spec, false)
			if err != nil {
				return resultFromError(err)
			}
			if folder.FolderEnvs != nil {
				folder.FolderEnvs[envID] = removeKVPair(folder.FolderEnvs[envID], k)
			}
		}
		for _, hRaw := range setHeaders {
			k, v, err := parseHeaderFlag(hRaw)
			if err != nil {
				return resultFromError(err)
			}
			folder.Headers = upsertKVPair(folder.Headers, k, v)
		}
		for _, k := range unsetHeaders {
			folder.Headers = removeKVPair(folder.Headers, strings.TrimSpace(k))
		}
		authCfg, authChanged, err := applyAuthFlags(folder.Auth, af, visited, true, "inherit", len(envAuths) > 0)
		if err != nil {
			return resultFromError(err)
		}
		if authChanged {
			folder.Auth = authCfg
		}
		if len(envAuths) > 0 {
			if folder.AuthEnvs == nil {
				folder.AuthEnvs = map[string]*model.AuthConfig{}
			}
			for _, spec := range envAuths {
				envID, aCfg, err := c.parseEnvAuthSpec(collRoot, spec, af, true)
				if err != nil {
					return resultFromError(err)
				}
				folder.AuthEnvs[envID] = aCfg
			}
		}
		if visited["name"] {
			if renRes := c.collSvc.RenameFolder(node.ID, strings.TrimSpace(name)); !renRes.Success {
				return renRes
			}
			folder.Name = strings.TrimSpace(name)
		}

		if updRes := c.collSvc.UpdateFolder(folder); !updRes.Success {
			return updRes
		}
		return c.collSvc.LoadFolder(folder.ID)

	case "delete", "rm":
		fset := flag.NewFlagSet("folder delete", flag.ContinueOnError)
		pos, err := parseSubcommandFlags(fset, rest)
		if err != nil {
			return model.NewError(model.ErrValidation, err.Error())
		}
		if len(pos) == 0 {
			return model.NewError(model.ErrValidation, "folder selector <id|path> is required")
		}
		node, _, err := c.collSvc.ResolveFolderSelector(collRoot, pos[0])
		if err != nil {
			return resultFromError(err)
		}
		delRes := c.collSvc.DeleteFolder(collRoot, node.ID)
		if !delRes.Success {
			return delRes
		}
		return model.NewSuccess(map[string]interface{}{
			"deleted_id": node.ID,
			"name":       node.Name,
		})

	case "move", "mv":
		fset := flag.NewFlagSet("folder move", flag.ContinueOnError)
		var toSel string
		fset.StringVar(&toSel, "to", "", "Target parent folder <id|path|root>")
		pos, err := parseSubcommandFlags(fset, rest)
		if err != nil {
			return model.NewError(model.ErrValidation, err.Error())
		}
		if len(pos) == 0 {
			return model.NewError(model.ErrValidation, "folder selector <id|path> is required")
		}
		visited := visitedFlagsMap(fset)
		if !visited["to"] {
			return model.NewError(model.ErrValidation, "--to <target-id|path|root> is required for `folder move`")
		}
		node, _, err := c.collSvc.ResolveFolderSelector(collRoot, pos[0])
		if err != nil {
			return resultFromError(err)
		}
		targetParentID := ""
		trimmedTo := strings.TrimSpace(toSel)
		if trimmedTo != "" && !strings.EqualFold(trimmedTo, "root") && trimmedTo != "/" {
			targetNode, _, err := c.collSvc.ResolveFolderSelector(collRoot, trimmedTo)
			if err != nil {
				return resultFromError(err)
			}
			targetParentID = targetNode.ID
		}
		return c.collSvc.MoveFolder(collRoot, node.ID, targetParentID)

	default:
		return model.NewError(model.ErrValidation, fmt.Sprintf("unknown folder verb %q (expected: list|tree|get|create|update|delete|move)", verb))
	}
}

// ============================================================================
// 4. REQUEST COMMANDS
// ============================================================================

type reqListEntry struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Method      string `json:"method"`
	URL         string `json:"url"`
	FolderPath  string `json:"folder_path"`
	PathDisplay string `json:"path_display"`
}

func (c *cliContext) flattenRequests(nodes []model.TreeNode, folderPrefix string) []reqListEntry {
	out := []reqListEntry{}
	for _, n := range nodes {
		if n.Type == "folder" {
			nextPrefix := n.Name
			if folderPrefix != "" {
				nextPrefix = folderPrefix + "/" + n.Name
			}
			out = append(out, c.flattenRequests(n.Children, nextPrefix)...)
		} else if n.Type == "request" {
			disp := n.Name
			if folderPrefix != "" {
				disp = folderPrefix + "/" + n.Name
			}
			urlVal := n.URL
			if urlVal == "" && n.Path != "" {
				var fullReq model.Request
				if err := c.fs.ReadJSON(n.Path, &fullReq); err == nil {
					urlVal = fullReq.URL
				}
			}
			out = append(out, reqListEntry{
				ID:          n.ID,
				Name:        n.Name,
				Method:      n.Method,
				URL:         urlVal,
				FolderPath:  folderPrefix,
				PathDisplay: disp,
			})
		}
	}
	return out
}

func normalizeHTTPMethod(raw string) (string, error) {
	upper := strings.ToUpper(strings.TrimSpace(raw))
	if upper == "" {
		return "GET", nil
	}
	switch upper {
	case "GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS":
		return upper, nil
	default:
		return "", fmt.Errorf("%s: invalid --method %q (expected GET, POST, PUT, PATCH, DELETE, HEAD, or OPTIONS)", model.ErrValidation, raw)
	}
}

func normalizeBodyType(raw string) (string, error) {
	lower := strings.ToLower(strings.TrimSpace(raw))
	switch lower {
	case "", "none":
		return "none", nil
	case "json":
		return "json", nil
	case "text", "raw":
		return "text", nil
	case "xml":
		return "xml", nil
	case "urlencoded", "x-www-form-urlencoded":
		return "urlencoded", nil
	case "formdata", "form-data", "multipart":
		return "formdata", nil
	default:
		return "", fmt.Errorf("%s: invalid --body-type %q (expected none|json|text|xml|urlencoded|formdata)", model.ErrValidation, raw)
	}
}

func indexOutsideTemplates(s string, target byte) int {
	inTemplate := 0
	for i := 0; i < len(s); i++ {
		if i+1 < len(s) && s[i] == '{' && s[i+1] == '{' {
			inTemplate++
			i++
			continue
		}
		if i+1 < len(s) && s[i] == '}' && s[i+1] == '}' && inTemplate > 0 {
			inTemplate--
			i++
			continue
		}
		if inTemplate == 0 && s[i] == target {
			return i
		}
	}
	return -1
}

func stripURLQuery(rawURL string) string {
	hashIdx := indexOutsideTemplates(rawURL, '#')
	fragment := ""
	beforeHash := rawURL
	if hashIdx >= 0 {
		beforeHash = rawURL[:hashIdx]
		fragment = rawURL[hashIdx:]
	}
	qIdx := indexOutsideTemplates(beforeHash, '?')
	if qIdx < 0 {
		return rawURL
	}
	return beforeHash[:qIdx] + fragment
}

func (c *cliContext) handleReq(args []string) model.Result {
	if len(args) == 0 {
		return model.NewError(model.ErrValidation, "missing req verb (expected: list|get|create|update|delete|move)")
	}
	verb := strings.ToLower(strings.TrimSpace(args[0]))
	rest := args[1:]

	_, collRoot, err := c.resolveTargetCollection("")
	if err != nil {
		return resultFromError(err)
	}

	switch verb {
	case "list", "ls":
		fset := flag.NewFlagSet("req list", flag.ContinueOnError)
		var folderSel string
		fset.StringVar(&folderSel, "folder", "", "Filter requests by folder <id|path>")
		if _, err := parseSubcommandFlags(fset, rest); err != nil {
			return model.NewError(model.ErrValidation, err.Error())
		}
		if strings.TrimSpace(folderSel) != "" {
			fNode, ancestors, err := c.collSvc.ResolveFolderSelector(collRoot, folderSel)
			if err != nil {
				return resultFromError(err)
			}
			names := make([]string, 0, len(ancestors)+1)
			for _, a := range ancestors {
				names = append(names, a.Name)
			}
			names = append(names, fNode.Name)
			prefix := strings.Join(names, "/")
			return model.NewSuccess(c.flattenRequests(fNode.Children, prefix))
		}
		treeRes := c.collSvc.GetTree(collRoot)
		if !treeRes.Success {
			return treeRes
		}
		nodes, _ := treeRes.Data.([]model.TreeNode)
		return model.NewSuccess(c.flattenRequests(nodes, ""))

	case "get", "show":
		fset := flag.NewFlagSet("req get", flag.ContinueOnError)
		pos, err := parseSubcommandFlags(fset, rest)
		if err != nil {
			return model.NewError(model.ErrValidation, err.Error())
		}
		if len(pos) == 0 {
			return model.NewError(model.ErrValidation, "request selector <id|path> is required")
		}
		req, _, _, err := c.collSvc.ResolveRequestSelector(collRoot, pos[0])
		if err != nil {
			return resultFromError(err)
		}
		return model.NewSuccess(req)

	case "create", "add":
		fset := flag.NewFlagSet("req create", flag.ContinueOnError)
		var name, method, urlStr, folderSel, bodyType, bodyRaw, preScriptRaw, postScriptRaw string
		var headers, params, pathParams, forms, urlencodeds, envAuths multiStringFlag
		var af authFlags
		fset.StringVar(&name, "name", "", "Request name")
		fset.StringVar(&method, "method", "GET", "HTTP method")
		fset.StringVar(&urlStr, "url", "", "Request URL")
		fset.StringVar(&folderSel, "folder", "", "Parent folder <id|path>")
		fset.Var(&headers, "header", "Request header 'K: V'")
		fset.Var(&params, "param", "Query parameter K=V")
		fset.Var(&pathParams, "path-param", "Path parameter K=V")
		fset.StringVar(&bodyType, "body-type", "none", "Body type (none|json|text|xml|urlencoded|formdata)")
		fset.StringVar(&bodyRaw, "body", "", "Body content string or @filepath")
		fset.Var(&forms, "form", "Multipart form-data K=V")
		fset.Var(&urlencodeds, "urlencoded", "URL-encoded form K=V")
		fset.Var(&envAuths, "env-auth", "Request env auth <env>:<type>")
		fset.StringVar(&preScriptRaw, "pre-script", "", "Pre-request JS script or @filepath")
		fset.StringVar(&postScriptRaw, "post-script", "", "Post-response JS script or @filepath")
		registerAuthFlags(fset, &af)

		pos, err := parseSubcommandFlags(fset, rest)
		if err != nil {
			return model.NewError(model.ErrValidation, err.Error())
		}
		if strings.TrimSpace(name) == "" && len(pos) > 0 {
			name = pos[0]
		}
		if strings.TrimSpace(name) == "" {
			return model.NewError(model.ErrValidation, "--name is required for `req create`")
		}
		if strings.TrimSpace(urlStr) == "" {
			return model.NewError(model.ErrValidation, "--url is required for `req create`")
		}
		visited := visitedFlagsMap(fset)

		normMethod, err := normalizeHTTPMethod(method)
		if err != nil {
			return resultFromError(err)
		}

		folderID := ""
		trimmedFolder := strings.TrimSpace(folderSel)
		if trimmedFolder != "" && !strings.EqualFold(trimmedFolder, "root") && trimmedFolder != "/" {
			fNode, _, err := c.collSvc.ResolveFolderSelector(collRoot, trimmedFolder)
			if err != nil {
				return resultFromError(err)
			}
			folderID = fNode.ID
		}

		normBodyType, err := normalizeBodyType(bodyType)
		if err != nil {
			return resultFromError(err)
		}
		if !visited["body-type"] {
			switch {
			case len(forms) > 0:
				normBodyType = "formdata"
			case len(urlencodeds) > 0:
				normBodyType = "urlencoded"
			case visited["body"] && strings.TrimSpace(bodyRaw) != "":
				normBodyType = "json"
			}
		}

		bodyContent, err := readStringOrFileFlag(bodyRaw)
		if err != nil {
			return resultFromError(err)
		}
		preScript, err := readStringOrFileFlag(preScriptRaw)
		if err != nil {
			return resultFromError(err)
		}
		postScript, err := readStringOrFileFlag(postScriptRaw)
		if err != nil {
			return resultFromError(err)
		}

		reqHeaders := []model.KVPair{}
		for _, hRaw := range headers {
			k, v, err := parseHeaderFlag(hRaw)
			if err != nil {
				return resultFromError(err)
			}
			reqHeaders = upsertKVPair(reqHeaders, k, v)
		}
		reqParams := []model.KVPair{}
		for _, pRaw := range params {
			k, v, err := parseKeyValueFlag(pRaw, "=")
			if err != nil {
				return resultFromError(err)
			}
			reqParams = upsertKVPair(reqParams, k, v)
		}
		reqPathParams := []model.KVPair{}
		for _, ppRaw := range pathParams {
			k, v, err := parseKeyValueFlag(ppRaw, "=")
			if err != nil {
				return resultFromError(err)
			}
			reqPathParams = upsertKVPair(reqPathParams, k, v)
		}
		formData := []model.KVPair{}
		for _, fRaw := range forms {
			k, v, err := parseKeyValueFlag(fRaw, "=")
			if err != nil {
				return resultFromError(err)
			}
			formData = upsertKVPair(formData, k, v)
		}
		urlEncodedData := []model.KVPair{}
		for _, uRaw := range urlencodeds {
			k, v, err := parseKeyValueFlag(uRaw, "=")
			if err != nil {
				return resultFromError(err)
			}
			urlEncodedData = upsertKVPair(urlEncodedData, k, v)
		}

		authCfg, _, err := applyAuthFlags(nil, af, visited, true, "inherit", len(envAuths) > 0)
		if err != nil {
			return resultFromError(err)
		}

		var authEnvs map[string]*model.AuthConfig
		if len(envAuths) > 0 {
			authEnvs = map[string]*model.AuthConfig{}
			for _, spec := range envAuths {
				envID, aCfg, err := c.parseEnvAuthSpec(collRoot, spec, af, true)
				if err != nil {
					return resultFromError(err)
				}
				authEnvs[envID] = aCfg
			}
		}

		createRes := c.collSvc.CreateRequest(collRoot, folderID)
		if !createRes.Success {
			return createRes
		}
		createdNode, _ := createRes.Data.(model.TreeNode)

		now := time.Now()
		req := model.Request{
			ID:         createdNode.ID,
			Name:       strings.TrimSpace(name),
			Method:     normMethod,
			URL:        strings.TrimSpace(urlStr),
			Headers:    reqHeaders,
			Params:     reqParams,
			PathParams: reqPathParams,
			Body: model.Body{
				Type:       normBodyType,
				Content:    bodyContent,
				FormData:   formData,
				URLEncoded: urlEncodedData,
			},
			Auth:     authCfg,
			AuthEnvs: authEnvs,
			Scripts: &model.Scripts{
				PreRequest:   preScript,
				PostResponse: postScript,
			},
			CreatedAt: now,
			UpdatedAt: now,
		}
		if err := engine.ReconcileRequestURLAndParams(&req); err != nil {
			return resultFromError(err)
		}
		if saveRes := c.reqSvc.Save(req); !saveRes.Success {
			return saveRes
		}
		return c.reqSvc.Get(req.ID)

	case "update", "patch":
		fset := flag.NewFlagSet("req update", flag.ContinueOnError)
		var name, method, urlStr, bodyType, bodyRaw, preScriptRaw, postScriptRaw string
		var setHeaders, unsetHeaders, setParams, unsetParams, setPathParams, unsetPathParams multiStringFlag
		var setForms, unsetForms, setUrlencodeds, unsetUrlencodeds, envAuths multiStringFlag
		var af authFlags

		fset.StringVar(&name, "name", "", "Request name")
		fset.StringVar(&method, "method", "", "HTTP method")
		fset.StringVar(&urlStr, "url", "", "Request URL")
		fset.Var(&setHeaders, "set-header", "Set header 'K: V'")
		fset.Var(&unsetHeaders, "unset-header", "Unset header K")
		fset.Var(&setParams, "set-param", "Set query param K=V")
		fset.Var(&unsetParams, "unset-param", "Unset query param K")
		fset.Var(&setPathParams, "set-path-param", "Set path param K=V")
		fset.Var(&unsetPathParams, "unset-path-param", "Unset path param K")
		fset.StringVar(&bodyType, "body-type", "", "Body type")
		fset.StringVar(&bodyRaw, "body", "", "Body content or @filepath")
		fset.Var(&setForms, "set-form", "Set form-data K=V")
		fset.Var(&unsetForms, "unset-form", "Unset form-data K")
		fset.Var(&setUrlencodeds, "set-urlencoded", "Set urlencoded K=V")
		fset.Var(&unsetUrlencodeds, "unset-urlencoded", "Unset urlencoded K")
		fset.Var(&envAuths, "env-auth", "Set request env auth <env>:<type>")
		fset.StringVar(&preScriptRaw, "pre-script", "", "Pre-request script or @filepath")
		fset.StringVar(&postScriptRaw, "post-script", "", "Post-response script or @filepath")
		registerAuthFlags(fset, &af)

		pos, err := parseSubcommandFlags(fset, rest)
		if err != nil {
			return model.NewError(model.ErrValidation, err.Error())
		}
		if len(pos) == 0 {
			return model.NewError(model.ErrValidation, "request selector <id|path> is required")
		}
		req, _, _, err := c.collSvc.ResolveRequestSelector(collRoot, pos[0])
		if err != nil {
			return resultFromError(err)
		}
		visited := visitedFlagsMap(fset)

		if visited["name"] {
			if strings.TrimSpace(name) == "" {
				return model.NewError(model.ErrValidation, "request name cannot be empty")
			}
			req.Name = strings.TrimSpace(name)
		}
		if visited["method"] {
			if strings.TrimSpace(method) == "" {
				return model.NewError(model.ErrValidation, "method cannot be empty")
			}
			normMethod, err := normalizeHTTPMethod(method)
			if err != nil {
				return resultFromError(err)
			}
			req.Method = normMethod
		}
		if visited["url"] {
			if strings.TrimSpace(urlStr) == "" {
				return model.NewError(model.ErrValidation, "url cannot be empty")
			}
			req.URL = strings.TrimSpace(urlStr)
			req.Params = []model.KVPair{}
			if err := engine.ReconcileRequestURLAndParams(&req); err != nil {
				return resultFromError(err)
			}
		}
		for _, hRaw := range setHeaders {
			k, v, err := parseHeaderFlag(hRaw)
			if err != nil {
				return resultFromError(err)
			}
			req.Headers = upsertKVPair(req.Headers, k, v)
		}
		for _, k := range unsetHeaders {
			req.Headers = removeKVPair(req.Headers, strings.TrimSpace(k))
		}
		for _, pRaw := range setParams {
			k, v, err := parseKeyValueFlag(pRaw, "=")
			if err != nil {
				return resultFromError(err)
			}
			req.Params = upsertKVPair(req.Params, k, v)
		}
		for _, k := range unsetParams {
			req.Params = removeKVPair(req.Params, strings.TrimSpace(k))
		}
		for _, ppRaw := range setPathParams {
			k, v, err := parseKeyValueFlag(ppRaw, "=")
			if err != nil {
				return resultFromError(err)
			}
			req.PathParams = upsertKVPair(req.PathParams, k, v)
		}
		for _, k := range unsetPathParams {
			req.PathParams = removeKVPair(req.PathParams, strings.TrimSpace(k))
		}

		if len(setParams) > 0 || len(unsetParams) > 0 {
			req.URL = stripURLQuery(req.URL)
		}
		if visited["url"] || len(setParams) > 0 || len(unsetParams) > 0 || len(setPathParams) > 0 || len(unsetPathParams) > 0 {
			if err := engine.ReconcileRequestURLAndParams(&req); err != nil {
				return resultFromError(err)
			}
		}

		if visited["body-type"] {
			normBT, err := normalizeBodyType(bodyType)
			if err != nil {
				return resultFromError(err)
			}
			req.Body.Type = normBT
		}
		if visited["body"] {
			content, err := readStringOrFileFlag(bodyRaw)
			if err != nil {
				return resultFromError(err)
			}
			req.Body.Content = content
		}
		for _, fRaw := range setForms {
			k, v, err := parseKeyValueFlag(fRaw, "=")
			if err != nil {
				return resultFromError(err)
			}
			req.Body.FormData = upsertKVPair(req.Body.FormData, k, v)
		}
		for _, k := range unsetForms {
			req.Body.FormData = removeKVPair(req.Body.FormData, strings.TrimSpace(k))
		}
		for _, uRaw := range setUrlencodeds {
			k, v, err := parseKeyValueFlag(uRaw, "=")
			if err != nil {
				return resultFromError(err)
			}
			req.Body.URLEncoded = upsertKVPair(req.Body.URLEncoded, k, v)
		}
		for _, k := range unsetUrlencodeds {
			req.Body.URLEncoded = removeKVPair(req.Body.URLEncoded, strings.TrimSpace(k))
		}
		if !visited["body-type"] && (req.Body.Type == "" || req.Body.Type == "none") {
			switch {
			case len(setForms) > 0:
				req.Body.Type = "formdata"
			case len(setUrlencodeds) > 0:
				req.Body.Type = "urlencoded"
			case visited["body"] && strings.TrimSpace(req.Body.Content) != "":
				req.Body.Type = "json"
			}
		}

		authCfg, authChanged, err := applyAuthFlags(req.Auth, af, visited, true, "inherit", len(envAuths) > 0)
		if err != nil {
			return resultFromError(err)
		}
		if authChanged {
			req.Auth = authCfg
		}
		if len(envAuths) > 0 {
			if req.AuthEnvs == nil {
				req.AuthEnvs = map[string]*model.AuthConfig{}
			}
			for _, spec := range envAuths {
				envID, aCfg, err := c.parseEnvAuthSpec(collRoot, spec, af, true)
				if err != nil {
					return resultFromError(err)
				}
				req.AuthEnvs[envID] = aCfg
			}
		}

		if visited["pre-script"] {
			if req.Scripts == nil {
				req.Scripts = &model.Scripts{}
			}
			s, err := readStringOrFileFlag(preScriptRaw)
			if err != nil {
				return resultFromError(err)
			}
			req.Scripts.PreRequest = s
		}
		if visited["post-script"] {
			if req.Scripts == nil {
				req.Scripts = &model.Scripts{}
			}
			s, err := readStringOrFileFlag(postScriptRaw)
			if err != nil {
				return resultFromError(err)
			}
			req.Scripts.PostResponse = s
		}

		if saveRes := c.reqSvc.Save(req); !saveRes.Success {
			return saveRes
		}
		return c.reqSvc.Get(req.ID)

	case "delete", "rm":
		fset := flag.NewFlagSet("req delete", flag.ContinueOnError)
		pos, err := parseSubcommandFlags(fset, rest)
		if err != nil {
			return model.NewError(model.ErrValidation, err.Error())
		}
		if len(pos) == 0 {
			return model.NewError(model.ErrValidation, "request selector <id|path> is required")
		}
		req, _, _, err := c.collSvc.ResolveRequestSelector(collRoot, pos[0])
		if err != nil {
			return resultFromError(err)
		}
		delRes := c.reqSvc.Delete(req.ID)
		if !delRes.Success {
			return delRes
		}
		return model.NewSuccess(map[string]interface{}{
			"deleted_id": req.ID,
			"name":       req.Name,
		})

	case "move", "mv":
		fset := flag.NewFlagSet("req move", flag.ContinueOnError)
		var toSel string
		fset.StringVar(&toSel, "to", "", "Target folder <id|path|root>")
		pos, err := parseSubcommandFlags(fset, rest)
		if err != nil {
			return model.NewError(model.ErrValidation, err.Error())
		}
		if len(pos) == 0 {
			return model.NewError(model.ErrValidation, "request selector <id|path> is required")
		}
		visited := visitedFlagsMap(fset)
		if !visited["to"] {
			return model.NewError(model.ErrValidation, "--to <target-id|path|root> is required for `req move`")
		}
		req, _, _, err := c.collSvc.ResolveRequestSelector(collRoot, pos[0])
		if err != nil {
			return resultFromError(err)
		}
		targetFolderID := ""
		trimmedTo := strings.TrimSpace(toSel)
		if trimmedTo != "" && !strings.EqualFold(trimmedTo, "root") && trimmedTo != "/" {
			targetNode, _, err := c.collSvc.ResolveFolderSelector(collRoot, trimmedTo)
			if err != nil {
				return resultFromError(err)
			}
			targetFolderID = targetNode.ID
		}
		return c.collSvc.MoveRequest(collRoot, req.ID, targetFolderID)

	default:
		return model.NewError(model.ErrValidation, fmt.Sprintf("unknown req verb %q (expected: list|get|create|update|delete|move)", verb))
	}
}

// ============================================================================
// 5. RUN COMMAND (`hecto run`)
// ============================================================================

func (c *cliContext) handleRun(args []string) model.Result {
	fset := flag.NewFlagSet("run", flag.ContinueOnError)
	var envSel string
	var cliVars multiStringFlag
	var timeoutSec int
	var noSaveEnv bool

	fset.StringVar(&envSel, "env", "", "Environment override <id|name|none>")
	fset.Var(&cliVars, "var", "Runtime variable override K=V")
	fset.IntVar(&timeoutSec, "timeout", 0, "HTTP timeout in seconds")
	fset.BoolVar(&noSaveEnv, "no-save-env", false, "Do not persist script variable/auth mutations to disk")

	pos, err := parseSubcommandFlags(fset, args)
	if err != nil {
		return model.NewError(model.ErrValidation, err.Error())
	}
	if len(pos) == 0 {
		return model.NewError(model.ErrValidation, "request selector <id|path> is required for `hecto run`")
	}

	visited := visitedFlagsMap(fset)
	if visited["timeout"] && timeoutSec <= 0 {
		return model.NewError(model.ErrValidation, "--timeout must be a positive integer (seconds)")
	}

	coll, collRoot, err := c.resolveTargetCollection("")
	if err != nil {
		return resultFromError(err)
	}

	req, pathFolders, allFolders, err := c.collSvc.ResolveRequestSelector(collRoot, pos[0])
	if err != nil {
		return resultFromError(err)
	}

	activeEnvID := coll.ActiveEnvID
	if visited["env"] {
		trimmedEnv := strings.TrimSpace(envSel)
		if trimmedEnv == "" || strings.EqualFold(trimmedEnv, "none") {
			activeEnvID = ""
			coll.ActiveEnvID = ""
		} else {
			envObj, err := c.collSvc.ResolveEnvironmentSelector(collRoot, trimmedEnv)
			if err != nil {
				return resultFromError(err)
			}
			activeEnvID = envObj.ID
			coll.ActiveEnvID = envObj.ID
		}
	}

	overrides := map[string]string{}
	for _, vRaw := range cliVars {
		k, v, err := parseKeyValueFlag(vRaw, "=")
		if err != nil {
			return resultFromError(err)
		}
		overrides[k] = v
	}

	runOut, err := engine.ExecuteRequestFlow(engine.RunOptions{
		FS:              c.fs,
		CollectionSvc:   c.collSvc,
		EnvSvc:          c.envSvc,
		RequestSvc:      c.reqSvc,
		ExecutorSvc:     c.execSvc,
		HistorySvc:      c.histSvc,
		CollectionsRoot: c.cfg.CollectionsRoot,
		CollectionRoot:  collRoot,
		Collection:      coll,
		Request:         req,
		PathFolders:     pathFolders,
		AllFolders:      allFolders,
		ActiveEnvID:     activeEnvID,
		CLIVarOverrides: overrides,
		TimeoutSec:      timeoutSec,
		NoSaveEnv:       noSaveEnv,
	})
	if err != nil {
		return resultFromError(err)
	}
	return model.NewSuccess(runOut)
}

// ============================================================================
// 6. IMPORT COMMAND (`hecto import`)
// ============================================================================

func (c *cliContext) saveImportedCurlRequest(collRoot, targetFolderID, rawCurl, nameOverride string) model.Result {
	parsedReq, err := engine.ParseCurl(rawCurl)
	if err != nil {
		return resultFromError(err)
	}
	if strings.TrimSpace(nameOverride) != "" {
		parsedReq.Name = strings.TrimSpace(nameOverride)
	}
	createRes := c.collSvc.CreateRequest(collRoot, targetFolderID)
	if !createRes.Success {
		return createRes
	}
	createdNode, _ := createRes.Data.(model.TreeNode)
	now := time.Now()
	parsedReq.ID = createdNode.ID
	parsedReq.CreatedAt = now
	parsedReq.UpdatedAt = now
	if err := engine.ReconcileRequestURLAndParams(parsedReq); err != nil {
		return resultFromError(err)
	}
	if saveRes := c.reqSvc.Save(*parsedReq); !saveRes.Success {
		return saveRes
	}
	return c.reqSvc.Get(parsedReq.ID)
}

func (c *cliContext) handleImport(args []string) model.Result {
	fset := flag.NewFlagSet("import", flag.ContinueOnError)
	var folderSel, nameOverride string
	fset.StringVar(&folderSel, "folder", "", "Target folder <id|path>")
	fset.StringVar(&nameOverride, "name", "", "Override request or imported folder name")

	pos, err := parseSubcommandFlags(fset, args)
	if err != nil {
		return model.NewError(model.ErrValidation, err.Error())
	}
	if len(pos) == 0 {
		return model.NewError(model.ErrValidation, "<file-or-curl> argument is required for `hecto import`")
	}

	_, collRoot, err := c.resolveTargetCollection("")
	if err != nil {
		return resultFromError(err)
	}

	targetFolderID := ""
	targetDir := collRoot
	trimmedFolder := strings.TrimSpace(folderSel)
	if trimmedFolder != "" && !strings.EqualFold(trimmedFolder, "root") && trimmedFolder != "/" {
		fNode, _, err := c.collSvc.ResolveFolderSelector(collRoot, trimmedFolder)
		if err != nil {
			return resultFromError(err)
		}
		targetFolderID = fNode.ID
		targetDir = fNode.Path
	}

	input := pos[0]
	// 1. Direct cURL command string
	if engine.IsCurlCommand(input) {
		return c.saveImportedCurlRequest(collRoot, targetFolderID, input, nameOverride)
	}

	// 2. Otherwise, check file existence on disk BEFORE attempting any cURL or JSON parsing
	info, err := os.Stat(input)
	if err != nil {
		if os.IsNotExist(err) {
			return model.NewError(model.ErrNotFound, fmt.Sprintf("file not found: %s", input))
		}
		return model.NewError(model.ErrIO, err.Error())
	}
	if info.IsDir() {
		return model.NewError(model.ErrValidation, fmt.Sprintf("expected file path, got directory: %s", input))
	}

	// 3. Read file contents and determine whether it is a cURL file or a Postman v2.1 JSON file
	rawBytes, err := os.ReadFile(input)
	if err != nil {
		return model.NewError(model.ErrIO, err.Error())
	}
	content := strings.TrimSpace(string(rawBytes))
	if engine.IsCurlCommand(content) {
		return c.saveImportedCurlRequest(collRoot, targetFolderID, content, nameOverride)
	}

	return c.importSvc.ImportPostmanWithOptions(targetDir, input, nameOverride, nil)
}
