package main

import (
	"bytes"
	"context"
	_ "embed"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/url"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
	"unicode/utf8"

	"github.com/fsnotify/fsnotify"
	"github.com/google/uuid"

	"hecto-api/engine"
	"hecto-api/model"
	"hecto-api/service"
	"hecto-api/storage"
)

//go:embed SKILL.md
var skillMD string

var cliVersion = "dev"

const agentGuideBanner = "🤖 AI AGENT / LLM GUIDE: Run `hecto agent-guide --toc` or `hecto agent-guide --section <id|alias>` (or `hecto agent-guide` for the full SKILL.md manual)."

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
	flowSvc    *service.FlowService
	mockSvc    *service.MockServerService
	execSvc    *service.ExecutorService
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
		errRes := model.NewError(model.ErrValidation, globalOpts.err)
		writeDaemonHandshakeError(errRes)
		return emitResult(stdout, stderr, globalOpts.jsonOutput, errRes)
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
		return handleAgentGuide(cmdArgs, stdout, stderr, globalOpts.jsonOutput)
	}

	fs := storage.NewFileSystem()
	cfgSvc := service.NewConfigService(fs, silentLogger)
	if globalOpts.dataDir != "" {
		globalOpts.dataDir = normalizeAbsPath(globalOpts.dataDir)
		cfgSvc.SetCustomConfigDir(globalOpts.dataDir)
	} else if envDir := strings.TrimSpace(os.Getenv("HECTO_CONFIG_DIR")); envDir != "" {
		cfgSvc.SetCustomConfigDir(normalizeAbsPath(envDir))
	}
	ctx := context.Background()
	cfg, err := cfgSvc.Initialize(ctx)
	if err != nil {
		errRes := model.NewError(model.ErrIO, err.Error())
		writeDaemonHandshakeError(errRes)
		return emitResult(stdout, stderr, globalOpts.jsonOutput, errRes)
	}

	c := &cliContext{
		ctx:        ctx,
		fs:         fs,
		logger:     silentLogger,
		cfgSvc:     cfgSvc,
		collSvc:    service.NewCollectionService(fs, silentLogger),
		envSvc:     service.NewEnvironmentService(fs, silentLogger),
		reqSvc:     service.NewRequestService(fs, silentLogger),
		flowSvc:    service.NewFlowService(fs, silentLogger),
		mockSvc:    service.NewMockServerService(fs, silentLogger),
		execSvc:    service.NewExecutorService(silentLogger),
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
	case "flow", "flows":
		res = c.handleFlow(cmdArgs)
	case "mock", "mocks":
		handled, code, mockRes := c.handleMock(cmdArgs, stdout)
		if handled {
			return code
		}
		res = mockRes
	case "run", "exec":
		res = c.handleRun(cmdArgs)
	case "import":
		res = c.handleImport(cmdArgs)
	default:
		res = model.NewError(model.ErrValidation, fmt.Sprintf("unknown command %q (run `hecto --help` or `hecto agent-guide`)", topCmd))
	}

	if !res.Success {
		writeDaemonHandshakeError(res)
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
	"daemon":      true,
	"enabled":     true,
	"disabled":    true,
	"toc":         true,
	"list":        true,
	"compact":     true,
	"redact":      true,
	"effective":   true,
	"all":         true,
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
	_, _ = fmt.Fprintln(w, "  hecto run <id|path> [--compact] [--redact] [--max-body <bytes>] [flags]")
	_, _ = fmt.Fprintln(w, "  hecto flow run <id|path> [--compact] [--redact] [--max-body <bytes>] [flags]")
	_, _ = fmt.Fprintln(w, "  hecto import <file-or-curl> [flags]")
	_, _ = fmt.Fprintln(w, "  hecto agent-guide [--toc | --list | --section <id|alias[,...]>] [--json]")
	_, _ = fmt.Fprintln(w, "")
	_, _ = fmt.Fprintln(w, "Entities & Verbs:")
	_, _ = fmt.Fprintln(w, "  collection  list | get | create | update | delete | switch")
	_, _ = fmt.Fprintln(w, "  env         list | get | create | update | delete | activate")
	_, _ = fmt.Fprintln(w, "  folder      list | tree | get | create | update | delete | move")
	_, _ = fmt.Fprintln(w, "  req         list | get | create | update | delete | move | example")
	_, _ = fmt.Fprintln(w, "  flow        list | tree | get | create | update | delete | move | folder | run")
	_, _ = fmt.Fprintln(w, "  mock        status | config | start (serve) | stop | route <list|get|create|update|delete>")
	_, _ = fmt.Fprintln(w, "")
	_, _ = fmt.Fprintln(w, "Top-Level Commands:")
	_, _ = fmt.Fprintln(w, "  run         Execute a request through the shared TypeScript/goja engine (--compact, --redact, --max-body)")
	_, _ = fmt.Fprintln(w, "  import      Import a Postman v2.1 JSON file or a raw cURL command/file")
	_, _ = fmt.Fprintln(w, "  agent-guide Print SKILL.md (--toc for index, --section <id|alias> for JIT slice)")
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
		switch v := res.Data.(type) {
		case *engine.FlowRunOutput:
			if v != nil && v.Status == "failed" {
				return 1
			}
		case engine.FlowRunOutput:
			if v.Status == "failed" {
				return 1
			}
		case *compactFlowRunOutput:
			if v != nil && v.Status == "failed" {
				return 1
			}
		case compactFlowRunOutput:
			if v.Status == "failed" {
				return 1
			}
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

type agentGuideSection struct {
	ID      string
	Level   int
	Title   string
	Content string
	Aliases []string
}

type agentGuideTOCEntry struct {
	ID      string   `json:"id"`
	Level   int      `json:"level"`
	Title   string   `json:"title"`
	Aliases []string `json:"aliases,omitempty"`
}

var sectionAliasesByID = map[string][]string{
	"1":   {"rules", "golden-rules"},
	"2":   {"model", "variables", "auth"},
	"3":   {"commands", "matrix"},
	"3.1": {"collection", "coll"},
	"3.2": {"env", "environment"},
	"3.3": {"folder", "dir"},
	"3.4": {"req", "request"},
	"3.5": {"run", "exec", "import", "agent-guide", "guide", "skill"},
	"4":   {"script", "scripting", "ha", "pm", "runoutput", "compact", "redact"},
	"5":   {"recipe", "examples"},
	"6":   {"flow", "flows"},
	"6.1": {"flow-commands"},
	"6.2": {"steps", "nodes-json"},
	"6.3": {"flow-output"},
	"7":   {"mock", "mocks"},
	"7.1": {"mock-commands"},
	"7.2": {"mock-schemas"},
	"7.3": {"mock-recipe"},
}

func isAllASCIIDigits(s string) bool {
	if s == "" {
		return false
	}
	for i := 0; i < len(s); i++ {
		if s[i] < '0' || s[i] > '9' {
			return false
		}
	}
	return true
}

func trimSectionBlock(lines []string) string {
	end := len(lines)
	for end > 0 {
		trimmed := strings.TrimSpace(lines[end-1])
		if trimmed == "" || trimmed == "---" {
			end--
			continue
		}
		break
	}
	return strings.Join(lines[:end], "\n")
}

func parseSkillSections(md string) []agentGuideSection {
	lines := strings.Split(strings.ReplaceAll(md, "\r\n", "\n"), "\n")
	type headingLine struct {
		level int
		line  int
	}
	var allHeadings []headingLine
	var numbered []agentGuideSection

	inFence := false
	for i, raw := range lines {
		trimmed := strings.TrimSpace(raw)
		if strings.HasPrefix(trimmed, "```") {
			inFence = !inFence
			continue
		}
		if inFence {
			continue
		}
		if strings.HasPrefix(raw, "# ") && !strings.HasPrefix(raw, "## ") {
			allHeadings = append(allHeadings, headingLine{level: 1, line: i})
			continue
		}
		if strings.HasPrefix(raw, "## ") && !strings.HasPrefix(raw, "### ") {
			allHeadings = append(allHeadings, headingLine{level: 2, line: i})
			rest := strings.TrimSpace(raw[3:])
			if dot := strings.IndexByte(rest, '.'); dot > 0 && isAllASCIIDigits(rest[:dot]) {
				id := rest[:dot]
				numbered = append(numbered, agentGuideSection{
					ID:      id,
					Level:   2,
					Title:   strings.TrimSpace(rest[dot+1:]),
					Aliases: sectionAliasesByID[id],
				})
				numbered[len(numbered)-1].Content = fmt.Sprintf("%d", i)
			}
			continue
		}
		if strings.HasPrefix(raw, "### ") && !strings.HasPrefix(raw, "#### ") {
			allHeadings = append(allHeadings, headingLine{level: 3, line: i})
			rest := strings.TrimSpace(raw[4:])
			parts := strings.SplitN(rest, ".", 3)
			if len(parts) == 3 && isAllASCIIDigits(parts[0]) && isAllASCIIDigits(parts[1]) {
				id := parts[0] + "." + parts[1]
				numbered = append(numbered, agentGuideSection{
					ID:      id,
					Level:   3,
					Title:   strings.TrimSpace(parts[2]),
					Aliases: sectionAliasesByID[id],
				})
				numbered[len(numbered)-1].Content = fmt.Sprintf("%d", i)
			}
		}
	}

	for idx := range numbered {
		startLine, _ := strconv.Atoi(numbered[idx].Content)
		endLine := len(lines)
		for _, hl := range allHeadings {
			if hl.line > startLine && hl.level <= numbered[idx].Level {
				endLine = hl.line
				break
			}
		}
		numbered[idx].Content = trimSectionBlock(lines[startLine:endLine])
	}
	return numbered
}

func resolveSkillSectionSelectors(rawSelectors []string, sections []agentGuideSection) ([]string, error) {
	byID := make(map[string]agentGuideSection, len(sections))
	aliasToIDs := map[string][]string{
		"core": {"1", "2", "3"},
	}
	for _, sec := range sections {
		byID[sec.ID] = sec
		aliasToIDs[strings.ToLower(sec.ID)] = []string{sec.ID}
		for _, alias := range sec.Aliases {
			aliasToIDs[strings.ToLower(alias)] = []string{sec.ID}
		}
	}

	var expanded []string
	seen := map[string]bool{}
	for _, raw := range rawSelectors {
		parts := strings.Split(raw, ",")
		for _, p := range parts {
			tok := strings.ToLower(strings.TrimSpace(p))
			if tok == "" {
				return nil, fmt.Errorf("%s: empty section selector in --section", model.ErrValidation)
			}
			ids, ok := aliasToIDs[tok]
			if !ok {
				return nil, fmt.Errorf("%s: unknown agent-guide section %q (run `hecto agent-guide --toc` to list valid sections)", model.ErrValidation, strings.TrimSpace(p))
			}
			for _, id := range ids {
				if _, exists := byID[id]; !exists {
					return nil, fmt.Errorf("%s: section %q not found in embedded SKILL.md", model.ErrValidation, id)
				}
				if !seen[id] {
					seen[id] = true
					expanded = append(expanded, id)
				}
			}
		}
	}

	if len(expanded) == 0 {
		return nil, fmt.Errorf("%s: --section requires at least one section id or alias", model.ErrValidation)
	}

	// If a parent section N is selected, skip child subsections N.M to avoid duplicate output.
	parentSelected := map[string]bool{}
	for _, id := range expanded {
		if !strings.Contains(id, ".") {
			parentSelected[id] = true
		}
	}
	deduped := make([]string, 0, len(expanded))
	for _, id := range expanded {
		if dot := strings.IndexByte(id, '.'); dot > 0 {
			if parentSelected[id[:dot]] {
				continue
			}
		}
		deduped = append(deduped, id)
	}
	return deduped, nil
}

func handleAgentGuide(args []string, stdout, stderr io.Writer, jsonOutput bool) int {
	if len(args) == 0 {
		if !jsonOutput {
			_, _ = fmt.Fprint(stdout, skillMD)
			return 0
		}
		return emitResult(stdout, stderr, true, model.NewSuccess(map[string]interface{}{
			"content": skillMD,
		}))
	}

	fset := flag.NewFlagSet("agent-guide", flag.ContinueOnError)
	var tocFlag, listFlag bool
	var sectionFlags multiStringFlag
	fset.BoolVar(&tocFlag, "toc", false, "Print concise Table of Contents with section IDs and aliases")
	fset.BoolVar(&listFlag, "list", false, "Alias for --toc")
	fset.Var(&sectionFlags, "section", "Extract one or more section IDs/aliases (comma-separated or repeated)")

	pos, err := parseSubcommandFlags(fset, args)
	if err != nil {
		return emitResult(stdout, stderr, jsonOutput, model.NewError(model.ErrValidation, err.Error()))
	}
	if err := rejectUnexpectedPositionals(pos, 0); err != nil {
		return emitResult(stdout, stderr, jsonOutput, resultFromError(err))
	}

	visited := visitedFlagsMap(fset)
	wantTOC := tocFlag || listFlag
	wantSection := visited["section"]
	if wantTOC && wantSection {
		return emitResult(stdout, stderr, jsonOutput, model.NewError(model.ErrValidation, "cannot specify both --toc/--list and --section"))
	}

	if !wantTOC && !wantSection {
		if !jsonOutput {
			_, _ = fmt.Fprint(stdout, skillMD)
			return 0
		}
		return emitResult(stdout, stderr, true, model.NewSuccess(map[string]interface{}{
			"content": skillMD,
		}))
	}

	sections := parseSkillSections(skillMD)
	if wantTOC {
		if jsonOutput {
			toc := make([]agentGuideTOCEntry, 0, len(sections))
			for _, sec := range sections {
				toc = append(toc, agentGuideTOCEntry{
					ID:      sec.ID,
					Level:   sec.Level,
					Title:   sec.Title,
					Aliases: sec.Aliases,
				})
			}
			return emitResult(stdout, stderr, true, model.NewSuccess(map[string]interface{}{
				"sections":          toc,
				"composite_aliases": map[string][]string{"core": {"1", "2", "3"}},
			}))
		}
		var b strings.Builder
		b.WriteString("# hecto agent-guide — Table of Contents\n\n")
		for _, sec := range sections {
			indent := ""
			if sec.Level == 3 {
				indent = "  "
			}
			aliasStr := ""
			if len(sec.Aliases) > 0 {
				aliasStr = fmt.Sprintf(" (aliases: %s)", strings.Join(sec.Aliases, ", "))
			}
			b.WriteString(fmt.Sprintf("%s- [%s] %s%s\n", indent, sec.ID, sec.Title, aliasStr))
		}
		b.WriteString("\nComposite alias: core -> 1, 2, 3\n")
		b.WriteString("Usage: hecto agent-guide --section <id|alias[,...]>\n")
		_, _ = fmt.Fprint(stdout, b.String())
		return 0
	}

	selectedIDs, err := resolveSkillSectionSelectors(sectionFlags, sections)
	if err != nil {
		return emitResult(stdout, stderr, jsonOutput, resultFromError(err))
	}

	byID := make(map[string]agentGuideSection, len(sections))
	for _, sec := range sections {
		byID[sec.ID] = sec
	}
	blocks := make([]string, 0, len(selectedIDs))
	for _, id := range selectedIDs {
		blocks = append(blocks, byID[id].Content)
	}
	joined := strings.Join(blocks, "\n\n---\n\n")
	if jsonOutput {
		return emitResult(stdout, stderr, true, model.NewSuccess(map[string]interface{}{
			"sections": selectedIDs,
			"content":  joined,
		}))
	}
	_, _ = fmt.Fprintln(stdout, joined)
	return 0
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
		return model.NewError(model.ErrValidation, "missing req verb (expected: list|get|create|update|delete|move|example)")
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
		var exampleSel string
		var effective bool
		fset.StringVar(&exampleSel, "example", "", "Example <id|name> to inspect")
		fset.BoolVar(&effective, "effective", false, "Return effective merged request when --example is set")
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
		if strings.TrimSpace(exampleSel) != "" {
			_, ex, exErr := service.ResolveExampleSelector(req, exampleSel)
			if exErr != nil {
				return resultFromError(exErr)
			}
			if effective {
				return model.NewSuccess(service.ResolveEffectiveRequestForExample(req, ex))
			}
			return model.NewSuccess(ex)
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
		service.SyncAllExamplesFromDefault(&req, nil)
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

		service.SyncAllExamplesFromDefault(&req, nil)
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

	case "example", "examples", "ex":
		return c.handleReqExample(collRoot, rest)

	default:
		return model.NewError(model.ErrValidation, fmt.Sprintf("unknown req verb %q (expected: list|get|create|update|delete|move|example)", verb))
	}
}

func setExampleSyncFlag(flags *model.ExampleSyncFlags, group string, val bool) error {
	switch strings.ToLower(strings.TrimSpace(group)) {
	case "url":
		flags.URL = val
	case "method":
		flags.Method = val
	case "auth":
		flags.Auth = val
	case "scripts":
		flags.Scripts = val
	case "body":
		flags.Body = val
	case "params":
		flags.Params = val
	case "path_params", "path-params":
		flags.PathParams = val
	case "headers":
		flags.Headers = val
	case "variables", "vars":
		flags.Variables = val
	default:
		return fmt.Errorf("%s: unknown sync flag group %q (expected url|method|auth|scripts|body|params|path_params|headers|variables)", model.ErrValidation, group)
	}
	return nil
}

func (c *cliContext) handleReqExample(collRoot string, args []string) model.Result {
	if len(args) == 0 {
		return model.NewError(model.ErrValidation, "missing req example verb (expected: list|get|create|update|delete|sync|detach)")
	}
	verb := strings.ToLower(strings.TrimSpace(args[0]))
	rest := args[1:]

	switch verb {
	case "list", "ls":
		fset := flag.NewFlagSet("req example list", flag.ContinueOnError)
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
		examples := req.Examples
		if examples == nil {
			examples = []model.RequestExample{}
		}
		return model.NewSuccess(examples)

	case "get", "show":
		fset := flag.NewFlagSet("req example get", flag.ContinueOnError)
		var effective bool
		fset.BoolVar(&effective, "effective", false, "Return effective merged request")
		pos, err := parseSubcommandFlags(fset, rest)
		if err != nil {
			return model.NewError(model.ErrValidation, err.Error())
		}
		if len(pos) < 2 {
			return model.NewError(model.ErrValidation, "usage: hecto req example get <req-id|path> <example-id|name> [--effective]")
		}
		req, _, _, err := c.collSvc.ResolveRequestSelector(collRoot, pos[0])
		if err != nil {
			return resultFromError(err)
		}
		_, ex, err := service.ResolveExampleSelector(req, pos[1])
		if err != nil {
			return resultFromError(err)
		}
		if effective {
			return model.NewSuccess(service.ResolveEffectiveRequestForExample(req, ex))
		}
		return model.NewSuccess(ex)

	case "create", "new", "add":
		fset := flag.NewFlagSet("req example create", flag.ContinueOnError)
		var name, fromSel string
		fset.StringVar(&name, "name", "", "Example name")
		fset.StringVar(&fromSel, "from", "", "Source example <id|name> to clone instead of Default")
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
		trimmedName := strings.TrimSpace(name)
		if trimmedName == "" {
			trimmedName = service.GenerateUniqueExampleName(fmt.Sprintf("Example %d", len(req.Examples)+1), req.Examples)
		}
		var ex model.RequestExample
		if strings.TrimSpace(fromSel) != "" {
			_, srcEx, exErr := service.ResolveExampleSelector(req, fromSel)
			if exErr != nil {
				return resultFromError(exErr)
			}
			eff := service.ResolveEffectiveRequestForExample(req, srcEx)
			ex = service.CloneRequestToExample(eff, trimmedName)
		} else {
			ex = service.CloneRequestToExample(req, trimmedName)
		}
		req.Examples = append(req.Examples, ex)
		req.UpdatedAt = time.Now()
		if saveRes := c.reqSvc.Save(req); !saveRes.Success {
			return saveRes
		}
		return model.NewSuccess(ex)

	case "update", "patch":
		fset := flag.NewFlagSet("req example update", flag.ContinueOnError)
		var name, method, urlStr, bodyType, bodyRaw, preScriptRaw, postScriptRaw string
		var setHeaders, unsetHeaders, setParams, unsetParams, setPathParams, unsetPathParams multiStringFlag
		var setForms, unsetForms, setUrlencodeds, unsetUrlencodeds, envAuths, setVars, unsetVars, syncOpts multiStringFlag
		var af authFlags

		fset.StringVar(&name, "name", "", "Example name")
		fset.StringVar(&method, "method", "", "HTTP method")
		fset.StringVar(&urlStr, "url", "", "Request URL")
		fset.Var(&setHeaders, "set-header", "Set header 'K: V'")
		fset.Var(&unsetHeaders, "unset-header", "Unset header K")
		fset.Var(&setParams, "set-param", "Set query param K=V")
		fset.Var(&unsetParams, "unset-param", "Unset query param K")
		fset.Var(&setPathParams, "set-path-param", "Set path param K=V")
		fset.Var(&unsetPathParams, "unset-path-param", "Unset path param K")
		fset.Var(&setVars, "set-var", "Set request variable K=V")
		fset.Var(&unsetVars, "unset-var", "Unset request variable K")
		fset.StringVar(&bodyType, "body-type", "", "Body type")
		fset.StringVar(&bodyRaw, "body", "", "Body content or @filepath")
		fset.Var(&setForms, "set-form", "Set form-data K=V")
		fset.Var(&unsetForms, "unset-form", "Unset form-data K")
		fset.Var(&setUrlencodeds, "set-urlencoded", "Set urlencoded K=V")
		fset.Var(&unsetUrlencodeds, "unset-urlencoded", "Unset urlencoded K")
		fset.Var(&envAuths, "env-auth", "Set request env auth <env>:<type>")
		fset.StringVar(&preScriptRaw, "pre-script", "", "Pre-request script or @filepath")
		fset.StringVar(&postScriptRaw, "post-script", "", "Post-response script or @filepath")
		fset.Var(&syncOpts, "sync", "Set sync flag <group>=<true|false>")
		registerAuthFlags(fset, &af)

		pos, err := parseSubcommandFlags(fset, rest)
		if err != nil {
			return model.NewError(model.ErrValidation, err.Error())
		}
		if len(pos) < 2 {
			return model.NewError(model.ErrValidation, "usage: hecto req example update <req-id|path> <example-id|name> [flags]")
		}
		req, _, _, err := c.collSvc.ResolveRequestSelector(collRoot, pos[0])
		if err != nil {
			return resultFromError(err)
		}
		exIdx, ex, err := service.ResolveExampleSelector(req, pos[1])
		if err != nil {
			return resultFromError(err)
		}
		visited := visitedFlagsMap(fset)

		explicitSync := map[string]bool{}
		var resyncGroups []string
		for _, spec := range syncOpts {
			k, v, kvErr := parseKeyValueFlag(spec, "=")
			if kvErr != nil {
				return resultFromError(kvErr)
			}
			var boolVal bool
			switch strings.ToLower(strings.TrimSpace(v)) {
			case "true", "1", "yes":
				boolVal = true
			case "false", "0", "no":
				boolVal = false
			default:
				return model.NewError(model.ErrValidation, fmt.Sprintf("invalid boolean value %q in --sync %q", v, spec))
			}
			normGroup := strings.ToLower(strings.TrimSpace(k))
			if normGroup == "path-params" {
				normGroup = "path_params"
			} else if normGroup == "vars" {
				normGroup = "variables"
			}
			if setErr := setExampleSyncFlag(&ex.SyncFlags, normGroup, boolVal); setErr != nil {
				return resultFromError(setErr)
			}
			explicitSync[normGroup] = boolVal
			if boolVal {
				resyncGroups = append(resyncGroups, normGroup)
			}
		}

		if visited["name"] {
			if strings.TrimSpace(name) == "" {
				return model.NewError(model.ErrValidation, "example name cannot be empty")
			}
			ex.Name = strings.TrimSpace(name)
		}
		if visited["method"] {
			if strings.TrimSpace(method) == "" {
				return model.NewError(model.ErrValidation, "method cannot be empty")
			}
			normMethod, mErr := normalizeHTTPMethod(method)
			if mErr != nil {
				return resultFromError(mErr)
			}
			ex.Method = normMethod
			if _, ok := explicitSync["method"]; !ok {
				ex.SyncFlags.Method = false
			}
		}
		if visited["url"] {
			if strings.TrimSpace(urlStr) == "" {
				return model.NewError(model.ErrValidation, "url cannot be empty")
			}
			if syncVal, hasExplicitURLSync := explicitSync["url"]; hasExplicitURLSync && syncVal {
				return model.NewError(model.ErrValidation, "cannot pass --url while --sync url=true keeps URL linked to Default")
			}
			ex.URL = strings.TrimSpace(urlStr)
			ex.Params = []model.KVPair{}
			if _, ok := explicitSync["url"]; !ok {
				ex.SyncFlags.URL = false
			}
			tmpURLReq := service.ResolveEffectiveRequestForExample(req, ex)
			tmpURLReq.URL = ex.URL
			tmpURLReq.Params = ex.Params
			tmpURLReq.PathParams = ex.PathParams
			if recErr := engine.ReconcileRequestURLAndParams(&tmpURLReq); recErr != nil {
				return resultFromError(recErr)
			}
			ex.URL = tmpURLReq.URL
			ex.Params = tmpURLReq.Params
			if !ex.SyncFlags.PathParams {
				ex.PathParams = tmpURLReq.PathParams
			}
			if len(ex.Params) > 0 {
				if _, ok := explicitSync["params"]; !ok {
					ex.SyncFlags.Params = false
				}
			}
		}
		for _, hRaw := range setHeaders {
			k, v, hErr := parseHeaderFlag(hRaw)
			if hErr != nil {
				return resultFromError(hErr)
			}
			ex.Headers = upsertKVPair(ex.Headers, k, v)
		}
		for _, k := range unsetHeaders {
			ex.Headers = removeKVPair(ex.Headers, strings.TrimSpace(k))
		}
		if len(setHeaders) > 0 || len(unsetHeaders) > 0 {
			if _, ok := explicitSync["headers"]; !ok {
				ex.SyncFlags.Headers = false
			}
		}
		for _, pRaw := range setParams {
			k, v, pErr := parseKeyValueFlag(pRaw, "=")
			if pErr != nil {
				return resultFromError(pErr)
			}
			ex.Params = upsertKVPair(ex.Params, k, v)
		}
		for _, k := range unsetParams {
			ex.Params = removeKVPair(ex.Params, strings.TrimSpace(k))
		}
		if len(setParams) > 0 || len(unsetParams) > 0 {
			if _, ok := explicitSync["params"]; !ok {
				ex.SyncFlags.Params = false
			}
			ex.URL = stripURLQuery(ex.URL)
		}
		for _, ppRaw := range setPathParams {
			k, v, ppErr := parseKeyValueFlag(ppRaw, "=")
			if ppErr != nil {
				return resultFromError(ppErr)
			}
			ex.PathParams = upsertKVPair(ex.PathParams, k, v)
		}
		for _, k := range unsetPathParams {
			ex.PathParams = removeKVPair(ex.PathParams, strings.TrimSpace(k))
		}
		if len(setPathParams) > 0 || len(unsetPathParams) > 0 {
			if _, ok := explicitSync["path_params"]; !ok {
				ex.SyncFlags.PathParams = false
			}
		}
		for _, vRaw := range setVars {
			k, v, vErr := parseKeyValueFlag(vRaw, "=")
			if vErr != nil {
				return resultFromError(vErr)
			}
			ex.Variables = upsertKVPair(ex.Variables, k, v)
		}
		for _, k := range unsetVars {
			ex.Variables = removeKVPair(ex.Variables, strings.TrimSpace(k))
		}
		if len(setVars) > 0 || len(unsetVars) > 0 {
			if _, ok := explicitSync["variables"]; !ok {
				ex.SyncFlags.Variables = false
			}
		}

		if visited["url"] || len(setParams) > 0 || len(unsetParams) > 0 || len(setPathParams) > 0 || len(unsetPathParams) > 0 {
			if ex.SyncFlags.URL {
				ex.URL = service.UpdateURLWithParams(req.URL, ex.Params)
				if !ex.SyncFlags.PathParams {
					ex.PathParams = service.ReconcilePathParams(req.URL, ex.PathParams)
				}
			} else {
				tmpReq := service.ResolveEffectiveRequestForExample(req, ex)
				tmpReq.URL = ex.URL
				tmpReq.Params = ex.Params
				tmpReq.PathParams = ex.PathParams
				if recErr := engine.ReconcileRequestURLAndParams(&tmpReq); recErr != nil {
					return resultFromError(recErr)
				}
				ex.URL = tmpReq.URL
				ex.Params = tmpReq.Params
				if !ex.SyncFlags.PathParams {
					ex.PathParams = tmpReq.PathParams
				}
			}
		}

		bodyTouched := false
		if visited["body-type"] {
			normBT, btErr := normalizeBodyType(bodyType)
			if btErr != nil {
				return resultFromError(btErr)
			}
			ex.Body.Type = normBT
			bodyTouched = true
		}
		if visited["body"] {
			content, bErr := readStringOrFileFlag(bodyRaw)
			if bErr != nil {
				return resultFromError(bErr)
			}
			ex.Body.Content = content
			bodyTouched = true
		}
		for _, fRaw := range setForms {
			k, v, fErr := parseKeyValueFlag(fRaw, "=")
			if fErr != nil {
				return resultFromError(fErr)
			}
			ex.Body.FormData = upsertKVPair(ex.Body.FormData, k, v)
			bodyTouched = true
		}
		for _, k := range unsetForms {
			ex.Body.FormData = removeKVPair(ex.Body.FormData, strings.TrimSpace(k))
			bodyTouched = true
		}
		for _, uRaw := range setUrlencodeds {
			k, v, uErr := parseKeyValueFlag(uRaw, "=")
			if uErr != nil {
				return resultFromError(uErr)
			}
			ex.Body.URLEncoded = upsertKVPair(ex.Body.URLEncoded, k, v)
			bodyTouched = true
		}
		for _, k := range unsetUrlencodeds {
			ex.Body.URLEncoded = removeKVPair(ex.Body.URLEncoded, strings.TrimSpace(k))
			bodyTouched = true
		}
		if !visited["body-type"] && (ex.Body.Type == "" || ex.Body.Type == "none") {
			switch {
			case len(setForms) > 0:
				ex.Body.Type = "formdata"
			case len(setUrlencodeds) > 0:
				ex.Body.Type = "urlencoded"
			case visited["body"] && strings.TrimSpace(ex.Body.Content) != "":
				ex.Body.Type = "json"
			}
		}
		if bodyTouched {
			if _, ok := explicitSync["body"]; !ok {
				ex.SyncFlags.Body = false
			}
		}

		authCfg, authChanged, err := applyAuthFlags(ex.Auth, af, visited, true, "inherit", len(envAuths) > 0)
		if err != nil {
			return resultFromError(err)
		}
		if authChanged {
			ex.Auth = authCfg
		}
		if len(envAuths) > 0 {
			if ex.AuthEnvs == nil {
				ex.AuthEnvs = map[string]*model.AuthConfig{}
			}
			for _, spec := range envAuths {
				envID, aCfg, aErr := c.parseEnvAuthSpec(collRoot, spec, af, true)
				if aErr != nil {
					return resultFromError(aErr)
				}
				ex.AuthEnvs[envID] = aCfg
			}
		}
		if authChanged || len(envAuths) > 0 {
			if _, ok := explicitSync["auth"]; !ok {
				ex.SyncFlags.Auth = false
			}
		}

		scriptsTouched := false
		if visited["pre-script"] {
			if ex.Scripts == nil {
				ex.Scripts = &model.Scripts{}
			}
			s, sErr := readStringOrFileFlag(preScriptRaw)
			if sErr != nil {
				return resultFromError(sErr)
			}
			ex.Scripts.PreRequest = s
			scriptsTouched = true
		}
		if visited["post-script"] {
			if ex.Scripts == nil {
				ex.Scripts = &model.Scripts{}
			}
			s, sErr := readStringOrFileFlag(postScriptRaw)
			if sErr != nil {
				return resultFromError(sErr)
			}
			ex.Scripts.PostResponse = s
			scriptsTouched = true
		}
		if scriptsTouched {
			if _, ok := explicitSync["scripts"]; !ok {
				ex.SyncFlags.Scripts = false
			}
		}

		if len(resyncGroups) > 0 {
			ex = service.SyncExampleFromDefault(req, ex, resyncGroups)
		}
		ex.UpdatedAt = time.Now()
		req.Examples[exIdx] = ex
		req.UpdatedAt = ex.UpdatedAt
		if saveRes := c.reqSvc.Save(req); !saveRes.Success {
			return saveRes
		}
		return model.NewSuccess(ex)

	case "delete", "rm":
		fset := flag.NewFlagSet("req example delete", flag.ContinueOnError)
		pos, err := parseSubcommandFlags(fset, rest)
		if err != nil {
			return model.NewError(model.ErrValidation, err.Error())
		}
		if len(pos) < 2 {
			return model.NewError(model.ErrValidation, "usage: hecto req example delete <req-id|path> <example-id|name>")
		}
		req, _, _, err := c.collSvc.ResolveRequestSelector(collRoot, pos[0])
		if err != nil {
			return resultFromError(err)
		}
		exIdx, ex, err := service.ResolveExampleSelector(req, pos[1])
		if err != nil {
			return resultFromError(err)
		}
		req.Examples = append(req.Examples[:exIdx], req.Examples[exIdx+1:]...)
		req.UpdatedAt = time.Now()
		if saveRes := c.reqSvc.Save(req); !saveRes.Success {
			return saveRes
		}
		return model.NewSuccess(map[string]interface{}{
			"deleted_id": ex.ID,
			"name":       ex.Name,
			"request_id": req.ID,
		})

	case "sync":
		fset := flag.NewFlagSet("req example sync", flag.ContinueOnError)
		var syncAll bool
		fset.BoolVar(&syncAll, "all", false, "Sync all examples according to their sync_flags")
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
		if syncAll {
			service.SyncAllExamplesFromDefault(&req, nil)
			req.UpdatedAt = time.Now()
			if saveRes := c.reqSvc.Save(req); !saveRes.Success {
				return saveRes
			}
			return model.NewSuccess(req.Examples)
		}
		if len(pos) < 2 {
			return model.NewError(model.ErrValidation, "example selector <id|name> or --all is required")
		}
		exIdx, ex, err := service.ResolveExampleSelector(req, pos[1])
		if err != nil {
			return resultFromError(err)
		}
		ex = service.SyncExampleFromDefault(req, ex, nil)
		req.Examples[exIdx] = ex
		req.UpdatedAt = time.Now()
		if saveRes := c.reqSvc.Save(req); !saveRes.Success {
			return saveRes
		}
		return model.NewSuccess(ex)

	case "detach", "promote":
		fset := flag.NewFlagSet("req example detach", flag.ContinueOnError)
		var newName string
		fset.StringVar(&newName, "name", "", "Name for the new standalone request")
		pos, err := parseSubcommandFlags(fset, rest)
		if err != nil {
			return model.NewError(model.ErrValidation, err.Error())
		}
		if len(pos) < 2 {
			return model.NewError(model.ErrValidation, "usage: hecto req example detach <req-id|path> <example-id|name> [--name <new-name>]")
		}
		req, _, _, err := c.collSvc.ResolveRequestSelector(collRoot, pos[0])
		if err != nil {
			return resultFromError(err)
		}
		return c.reqSvc.DetachExample(req.ID, pos[1], newName)

	default:
		return model.NewError(model.ErrValidation, fmt.Sprintf("unknown req example verb %q (expected: list|get|create|update|delete|sync|detach)", verb))
	}
}

// ============================================================================
// 5. RUN COMMAND (`hecto run`) & AGENT OUTPUT HELPERS
// ============================================================================

const (
	defaultCompactMaxBody     = 500
	redactedSecretPlaceholder = "***REDACTED***"
)

type compactRunOutput struct {
	StatusCode       int                       `json:"status_code"`
	StatusText       string                    `json:"status_text,omitempty"`
	TimeMs           int64                     `json:"time_ms"`
	SizeBytes        int64                     `json:"size_bytes"`
	Body             string                    `json:"body"`
	BodyTruncated    bool                      `json:"body_truncated,omitempty"`
	ScriptTests      []engine.ScriptTestResult `json:"script_tests,omitempty"`
	ScriptLogs       []string                  `json:"script_logs,omitempty"`
	EnvUpdates       map[string]string         `json:"env_updates,omitempty"`
	ScopedEnvUpdates *engine.ScopedEnvUpdates  `json:"scoped_env_updates,omitempty"`
	ScriptError      string                    `json:"script_error,omitempty"`
	NetworkError     string                    `json:"network_error,omitempty"`
}

type compactStepRunOutput struct {
	StatusCode       int                       `json:"status_code"`
	StatusText       string                    `json:"status_text,omitempty"`
	TimeMs           int64                     `json:"time_ms"`
	SizeBytes        int64                     `json:"size_bytes"`
	Body             string                    `json:"body,omitempty"`
	BodyTruncated    bool                      `json:"body_truncated,omitempty"`
	ScriptTests      []engine.ScriptTestResult `json:"script_tests,omitempty"`
	ScriptLogs       []string                  `json:"script_logs,omitempty"`
	EnvUpdates       map[string]string         `json:"env_updates,omitempty"`
	ScopedEnvUpdates *engine.ScopedEnvUpdates  `json:"scoped_env_updates,omitempty"`
	ScriptError      string                    `json:"script_error,omitempty"`
	NetworkError     string                    `json:"network_error,omitempty"`
}

type compactFlowStepRunOutput struct {
	StepID          string                `json:"step_id"`
	NodeID          string                `json:"node_id"`
	RequestID       string                `json:"request_id"`
	ExampleID       string                `json:"example_id,omitempty"`
	ExampleName     string                `json:"example_name,omitempty"`
	RequestName     string                `json:"request_name,omitempty"`
	Method          string                `json:"method,omitempty"`
	Status          string                `json:"status"`
	FailureCategory string                `json:"failure_category,omitempty"`
	FailureReason   string                `json:"failure_reason,omitempty"`
	RunOutput       *compactStepRunOutput `json:"run_output,omitempty"`
}

type compactFlowNodeRunOutput struct {
	NodeID          string                     `json:"node_id"`
	Status          string                     `json:"status"`
	MatchedBranchID string                     `json:"matched_branch_id,omitempty"`
	StepResults     []compactFlowStepRunOutput `json:"step_results"`
}

type compactFlowRunOutput struct {
	FlowID        string                     `json:"flow_id"`
	FlowName      string                     `json:"flow_name"`
	Status        string                     `json:"status"`
	TotalTimeMs   int64                      `json:"total_time_ms"`
	StepsExecuted int                        `json:"steps_executed"`
	StepsPassed   int                        `json:"steps_passed"`
	StepsFailed   int                        `json:"steps_failed"`
	StepsSkipped  int                        `json:"steps_skipped"`
	HaltedError   string                     `json:"halted_error,omitempty"`
	NodeResults   []compactFlowNodeRunOutput `json:"node_results"`
}

func isSensitiveHeaderKey(k string, extraKeys map[string]bool) bool {
	lower := strings.ToLower(strings.TrimSpace(k))
	if lower == "" {
		return false
	}
	if extraKeys[lower] {
		return true
	}
	switch lower {
	case "authorization", "proxy-authorization", "cookie", "set-cookie", "x-api-key", "api-key", "x-auth-token":
		return true
	}
	for _, needle := range []string{
		"token", "secret", "password", "apikey", "api-key", "api_key", "auth", "jwt", "credential", "session", "private-key", "private_key", "access-key", "access_key",
	} {
		if strings.Contains(lower, needle) {
			return true
		}
	}
	return false
}

func isSensitiveVarKey(k string) bool {
	lower := strings.ToLower(strings.TrimSpace(k))
	for _, needle := range []string{
		"token", "secret", "password", "passwd", "pwd", "apikey", "api-key", "api_key", "auth", "jwt", "credential", "private_key", "private-key", "access_key", "access-key", "cookie", "session",
	} {
		if strings.Contains(lower, needle) {
			return true
		}
	}
	return false
}

func isSensitiveKeyWithExtra(k string, extraKeys map[string]bool) bool {
	lower := strings.ToLower(strings.TrimSpace(k))
	if lower != "" && extraKeys[lower] {
		return true
	}
	return isSensitiveVarKey(lower)
}

func collectAPIKeyFromAuthConfig(cfg *model.AuthConfig, out map[string]bool) {
	if cfg != nil && strings.EqualFold(cfg.Type, "apiKey") && cfg.APIKey != nil {
		if key := strings.ToLower(strings.TrimSpace(cfg.APIKey.Key)); key != "" {
			out[key] = true
		}
	}
}

func collectAPIKeyFromAuthMap(m map[string]*model.AuthConfig, out map[string]bool) {
	for _, cfg := range m {
		collectAPIKeyFromAuthConfig(cfg, out)
	}
}

func collectRunAPIKeyNames(coll model.Collection, pathFolders []model.TreeNode, req model.Request) map[string]bool {
	out := map[string]bool{}
	collectAPIKeyFromAuthConfig(coll.Auth, out)
	collectAPIKeyFromAuthMap(coll.AuthEnvs, out)
	for _, pf := range pathFolders {
		collectAPIKeyFromAuthConfig(pf.Auth, out)
		collectAPIKeyFromAuthMap(pf.AuthEnvs, out)
	}
	collectAPIKeyFromAuthConfig(req.Auth, out)
	collectAPIKeyFromAuthMap(req.AuthEnvs, out)
	return out
}

func collectTreeFolderAPIKeys(nodes []model.TreeNode, out map[string]bool) {
	for _, n := range nodes {
		if n.Type == "folder" {
			collectAPIKeyFromAuthConfig(n.Auth, out)
			collectAPIKeyFromAuthMap(n.AuthEnvs, out)
		}
		if len(n.Children) > 0 {
			collectTreeFolderAPIKeys(n.Children, out)
		}
	}
}

func collectFlowAPIKeyNames(collSvc *service.CollectionService, reqSvc *service.RequestService, collRoot string, coll model.Collection, flow model.Flow) map[string]bool {
	out := map[string]bool{}
	collectAPIKeyFromAuthConfig(coll.Auth, out)
	collectAPIKeyFromAuthMap(coll.AuthEnvs, out)
	if collSvc != nil && collRoot != "" {
		if treeRes := collSvc.GetTree(collRoot); treeRes.Success {
			if nodes, ok := treeRes.Data.([]model.TreeNode); ok {
				collectTreeFolderAPIKeys(nodes, out)
			}
		}
	}
	if reqSvc != nil {
		seen := map[string]bool{}
		var reqIDs []string
		collectReferencedRequestIDs(flow.Nodes, seen, &reqIDs)
		for _, id := range reqIDs {
			if res := reqSvc.Get(id); res.Success {
				if req, ok := res.Data.(model.Request); ok {
					collectAPIKeyFromAuthConfig(req.Auth, out)
					collectAPIKeyFromAuthMap(req.AuthEnvs, out)
					for _, ex := range req.Examples {
						collectAPIKeyFromAuthConfig(ex.Auth, out)
						collectAPIKeyFromAuthMap(ex.AuthEnvs, out)
					}
				}
			}
		}
	}
	return out
}

func redactKVPairSecrets(kv *model.KVPair) {
	kv.Value = redactedSecretPlaceholder
	if len(kv.Options) > 0 {
		kv.Options = []string{redactedSecretPlaceholder}
	}
}

func redactHeaderKVPairs(pairs []model.KVPair, extraKeys map[string]bool) {
	for i := range pairs {
		if isSensitiveHeaderKey(pairs[i].Key, extraKeys) {
			redactKVPairSecrets(&pairs[i])
		}
	}
}

func redactVarKVPairs(pairs []model.KVPair, extraKeys map[string]bool) {
	for i := range pairs {
		if isSensitiveKeyWithExtra(pairs[i].Key, extraKeys) {
			redactKVPairSecrets(&pairs[i])
		}
	}
}

func redactSensitiveURLEncoded(rawQuery string, extraKeys map[string]bool) string {
	if rawQuery == "" {
		return rawQuery
	}
	parts := strings.Split(rawQuery, "&")
	changed := false
	for i, part := range parts {
		eq := strings.IndexByte(part, '=')
		if eq < 0 {
			continue
		}
		rawKey := part[:eq]
		decodedKey, err := url.QueryUnescape(rawKey)
		if err != nil {
			decodedKey = rawKey
		}
		if isSensitiveKeyWithExtra(decodedKey, extraKeys) {
			parts[i] = rawKey + "=" + redactedSecretPlaceholder
			changed = true
		}
	}
	if !changed {
		return rawQuery
	}
	return strings.Join(parts, "&")
}

func redactSensitiveURL(rawURL string, extraKeys map[string]bool) string {
	if rawURL == "" {
		return rawURL
	}
	u, err := url.Parse(rawURL)
	if err != nil {
		return rawURL
	}
	changed := false
	if u.User != nil {
		if _, hasPass := u.User.Password(); hasPass {
			u.User = url.UserPassword("REDACTED", "REDACTED")
		} else {
			u.User = url.User("REDACTED")
		}
		changed = true
	}
	if u.RawQuery != "" {
		redactedQ := redactSensitiveURLEncoded(u.RawQuery, extraKeys)
		if redactedQ != u.RawQuery {
			u.RawQuery = redactedQ
			changed = true
		}
	}
	if !changed {
		return rawURL
	}
	return u.String()
}

func redactSensitiveErrorText(msg string, extraKeys map[string]bool) string {
	if msg == "" {
		return msg
	}
	var out strings.Builder
	rest := msg
	for {
		idxHTTP := strings.Index(rest, "http://")
		idxHTTPS := strings.Index(rest, "https://")
		idx := -1
		if idxHTTP >= 0 && idxHTTPS >= 0 {
			if idxHTTP < idxHTTPS {
				idx = idxHTTP
			} else {
				idx = idxHTTPS
			}
		} else if idxHTTP >= 0 {
			idx = idxHTTP
		} else if idxHTTPS >= 0 {
			idx = idxHTTPS
		}
		if idx < 0 {
			out.WriteString(rest)
			break
		}
		out.WriteString(rest[:idx])
		urlPart := rest[idx:]
		end := len(urlPart)
		for i := 0; i < len(urlPart); i++ {
			c := urlPart[i]
			if c <= ' ' || c == '"' || c == '\'' || c == '>' || c == ')' || c == ']' {
				end = i
				break
			}
		}
		out.WriteString(redactSensitiveURL(urlPart[:end], extraKeys))
		rest = urlPart[end:]
	}
	return out.String()
}

func isURLEncodedRequest(req *model.ExecuteRequest) bool {
	if req == nil {
		return false
	}
	if strings.EqualFold(strings.TrimSpace(req.BodyType), "urlencoded") {
		return true
	}
	for _, h := range req.Headers {
		if h.Enabled && strings.EqualFold(strings.TrimSpace(h.Key), "content-type") &&
			strings.Contains(strings.ToLower(h.Value), "application/x-www-form-urlencoded") {
			return true
		}
	}
	return false
}

func redactExecuteRequest(req *model.ExecuteRequest, extraKeys map[string]bool) {
	if req == nil {
		return
	}
	req.URL = redactSensitiveURL(req.URL, extraKeys)
	redactHeaderKVPairs(req.Headers, extraKeys)
	redactVarKVPairs(req.FormData, extraKeys)
	if isURLEncodedRequest(req) && req.Body != "" {
		req.Body = redactSensitiveURLEncoded(req.Body, extraKeys)
	}
}

func redactStringMap(m map[string]string) {
	for k := range m {
		if isSensitiveVarKey(k) {
			m[k] = redactedSecretPlaceholder
		}
	}
}

func redactAuthConfig(cfg *model.AuthConfig) {
	if cfg == nil {
		return
	}
	if cfg.Bearer != nil {
		cfg.Bearer.Token = redactedSecretPlaceholder
	}
	if cfg.Basic != nil {
		cfg.Basic.Password = redactedSecretPlaceholder
	}
	if cfg.APIKey != nil {
		cfg.APIKey.Value = redactedSecretPlaceholder
	}
}

func redactRunOutput(ro *engine.RunOutput, extraKeys map[string]bool) {
	if ro == nil {
		return
	}
	mergedKeys := make(map[string]bool, len(extraKeys))
	for k, v := range extraKeys {
		mergedKeys[k] = v
	}
	if ro.ScopedAuthUpdates != nil {
		collectAPIKeyFromAuthConfig(ro.ScopedAuthUpdates.CollectionGlobal, mergedKeys)
		for _, item := range ro.ScopedAuthUpdates.CollectionEnvs {
			collectAPIKeyFromAuthConfig(item.Auth, mergedKeys)
		}
		for _, authCfg := range ro.ScopedAuthUpdates.FolderGlobals {
			collectAPIKeyFromAuthConfig(authCfg, mergedKeys)
		}
		for _, item := range ro.ScopedAuthUpdates.FolderEnvs {
			collectAPIKeyFromAuthConfig(item.Auth, mergedKeys)
		}
	}

	redactExecuteRequest(&ro.Request, mergedKeys)
	redactExecuteRequest(&ro.ResolvedRequest, mergedKeys)
	for k, vals := range ro.Headers {
		if isSensitiveHeaderKey(k, mergedKeys) {
			masked := make([]string, len(vals))
			for i := range masked {
				masked[i] = redactedSecretPlaceholder
			}
			ro.Headers[k] = masked
		}
	}
	redactStringMap(ro.EnvUpdates)
	if ro.ScopedEnvUpdates != nil {
		redactStringMap(ro.ScopedEnvUpdates.Collection)
		for _, envMap := range ro.ScopedEnvUpdates.GlobalEnvs {
			redactStringMap(envMap)
		}
		for _, folderMap := range ro.ScopedEnvUpdates.FolderGlobals {
			redactStringMap(folderMap)
		}
		for i := range ro.ScopedEnvUpdates.FolderEnvs {
			if isSensitiveVarKey(ro.ScopedEnvUpdates.FolderEnvs[i].Key) {
				ro.ScopedEnvUpdates.FolderEnvs[i].Value = redactedSecretPlaceholder
			}
		}
	}
	if ro.ScopedAuthUpdates != nil {
		redactAuthConfig(ro.ScopedAuthUpdates.CollectionGlobal)
		for i := range ro.ScopedAuthUpdates.CollectionEnvs {
			redactAuthConfig(ro.ScopedAuthUpdates.CollectionEnvs[i].Auth)
		}
		for _, authCfg := range ro.ScopedAuthUpdates.FolderGlobals {
			redactAuthConfig(authCfg)
		}
		for i := range ro.ScopedAuthUpdates.FolderEnvs {
			redactAuthConfig(ro.ScopedAuthUpdates.FolderEnvs[i].Auth)
		}
	}
	ro.NetworkError = redactSensitiveErrorText(ro.NetworkError, mergedKeys)
	ro.ScriptError = redactSensitiveErrorText(ro.ScriptError, mergedKeys)
}

func truncateUTF8Body(body string, maxBytes int) (string, bool) {
	if maxBytes < 0 || len(body) <= maxBytes {
		return body, false
	}
	cut := maxBytes
	for cut > 0 && !utf8.RuneStart(body[cut]) {
		cut--
	}
	return fmt.Sprintf("%s... [truncated, total %d bytes]", body[:cut], len(body)), true
}

func truncateRunOutputBody(ro *engine.RunOutput, maxBytes int) {
	if ro == nil || maxBytes < 0 {
		return
	}
	truncated, didTruncate := truncateUTF8Body(ro.Body, maxBytes)
	ro.Body = truncated
	ro.BodyTruncated = ro.BodyTruncated || didTruncate
}

func toCompactRunOutput(ro *engine.RunOutput) *compactRunOutput {
	if ro == nil {
		return nil
	}
	return &compactRunOutput{
		StatusCode:       ro.StatusCode,
		StatusText:       ro.StatusText,
		TimeMs:           ro.TimeMs,
		SizeBytes:        ro.SizeBytes,
		Body:             ro.Body,
		BodyTruncated:    ro.BodyTruncated,
		ScriptTests:      ro.ScriptTests,
		ScriptLogs:       ro.ScriptLogs,
		EnvUpdates:       ro.EnvUpdates,
		ScopedEnvUpdates: ro.ScopedEnvUpdates,
		ScriptError:      ro.ScriptError,
		NetworkError:     ro.NetworkError,
	}
}

func toCompactStepRunOutput(ro *engine.RunOutput, includeBody bool, maxBody int) *compactStepRunOutput {
	if ro == nil {
		return nil
	}
	out := &compactStepRunOutput{
		StatusCode:       ro.StatusCode,
		StatusText:       ro.StatusText,
		TimeMs:           ro.TimeMs,
		SizeBytes:        ro.SizeBytes,
		ScriptTests:      ro.ScriptTests,
		ScriptLogs:       ro.ScriptLogs,
		EnvUpdates:       ro.EnvUpdates,
		ScopedEnvUpdates: ro.ScopedEnvUpdates,
		ScriptError:      ro.ScriptError,
		NetworkError:     ro.NetworkError,
	}
	if includeBody {
		body, didTruncate := truncateUTF8Body(ro.Body, maxBody)
		out.Body = body
		out.BodyTruncated = ro.BodyTruncated || didTruncate
	}
	return out
}

func walkUniqueFlowRunOutputs(flowOut *engine.FlowRunOutput, fn func(*engine.RunOutput)) {
	if flowOut == nil {
		return
	}
	seen := map[*engine.RunOutput]bool{}
	visit := func(ro *engine.RunOutput) {
		if ro != nil && !seen[ro] {
			seen[ro] = true
			fn(ro)
		}
	}
	for i := range flowOut.NodeResults {
		for j := range flowOut.NodeResults[i].StepResults {
			visit(flowOut.NodeResults[i].StepResults[j].RunOutput)
		}
	}
	for i := range flowOut.StepResults {
		visit(flowOut.StepResults[i].RunOutput)
	}
}

func toCompactFlowRunOutput(flowOut *engine.FlowRunOutput, showPassedBody bool, maxBody int) *compactFlowRunOutput {
	if flowOut == nil {
		return nil
	}
	nodes := make([]compactFlowNodeRunOutput, 0, len(flowOut.NodeResults))
	for _, nr := range flowOut.NodeResults {
		steps := make([]compactFlowStepRunOutput, 0, len(nr.StepResults))
		for _, sr := range nr.StepResults {
			includeBody := sr.Status != "passed" || showPassedBody
			steps = append(steps, compactFlowStepRunOutput{
				StepID:          sr.StepID,
				NodeID:          sr.NodeID,
				RequestID:       sr.RequestID,
				ExampleID:       sr.ExampleID,
				ExampleName:     sr.ExampleName,
				RequestName:     sr.RequestName,
				Method:          sr.Method,
				Status:          sr.Status,
				FailureCategory: sr.FailureCategory,
				FailureReason:   sr.FailureReason,
				RunOutput:       toCompactStepRunOutput(sr.RunOutput, includeBody, maxBody),
			})
		}
		nodes = append(nodes, compactFlowNodeRunOutput{
			NodeID:          nr.NodeID,
			Status:          nr.Status,
			MatchedBranchID: nr.MatchedBranchID,
			StepResults:     steps,
		})
	}
	return &compactFlowRunOutput{
		FlowID:        flowOut.FlowID,
		FlowName:      flowOut.FlowName,
		Status:        flowOut.Status,
		TotalTimeMs:   flowOut.TotalTimeMs,
		StepsExecuted: flowOut.StepsExecuted,
		StepsPassed:   flowOut.StepsPassed,
		StepsFailed:   flowOut.StepsFailed,
		StepsSkipped:  flowOut.StepsSkipped,
		HaltedError:   flowOut.HaltedError,
		NodeResults:   nodes,
	}
}

func (c *cliContext) handleRun(args []string) model.Result {
	fset := flag.NewFlagSet("run", flag.ContinueOnError)
	var envSel, exampleSel string
	var cliVars multiStringFlag
	var timeoutSec, maxBody int
	var noSaveEnv, compact, redact bool

	fset.StringVar(&envSel, "env", "", "Environment override <id|name|none>")
	fset.StringVar(&exampleSel, "example", "", "Example <id|name> to run")
	fset.Var(&cliVars, "var", "Runtime variable override K=V")
	fset.IntVar(&timeoutSec, "timeout", 0, "HTTP timeout in seconds")
	fset.BoolVar(&noSaveEnv, "no-save-env", false, "Do not persist script variable/auth mutations to disk")
	fset.BoolVar(&compact, "compact", false, "Emit compact, redacted output for AI agents")
	fset.BoolVar(&redact, "redact", false, "Mask sensitive headers, variables, and auth secrets on stdout")
	fset.IntVar(&maxBody, "max-body", -1, "Truncate response body on stdout at max bytes")

	pos, err := parseSubcommandFlags(fset, args)
	if err != nil {
		return model.NewError(model.ErrValidation, err.Error())
	}
	if len(pos) == 0 {
		return model.NewError(model.ErrValidation, "request selector <id|path> is required for `hecto run`")
	}
	if err := rejectUnexpectedPositionals(pos, 1); err != nil {
		return resultFromError(err)
	}

	visited := visitedFlagsMap(fset)
	if visited["timeout"] && timeoutSec <= 0 {
		return model.NewError(model.ErrValidation, "--timeout must be a positive integer (seconds)")
	}
	if visited["max-body"] && maxBody < 0 {
		return model.NewError(model.ErrValidation, "--max-body must be a non-negative integer (bytes)")
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
		CollectionsRoot: c.cfg.CollectionsRoot,
		CollectionRoot:  collRoot,
		Collection:      coll,
		Request:         req,
		ExampleSelector: exampleSel,
		PathFolders:     pathFolders,
		AllFolders:      allFolders,
		ActiveEnvID:     activeEnvID,
		CLIVarOverrides: overrides,
		TimeoutSec:      timeoutSec,
		NoSaveEnv:       noSaveEnv,
	})
	effectiveReqForRedaction := req
	if strings.TrimSpace(exampleSel) != "" {
		if _, ex, exErr := service.ResolveExampleSelector(req, exampleSel); exErr == nil {
			effectiveReqForRedaction = service.ResolveEffectiveRequestForExample(req, ex)
		}
	}
	if err != nil {
		errRes := resultFromError(err)
		if (redact || compact) && errRes.Error != nil {
			extraAPIKeys := collectRunAPIKeyNames(coll, pathFolders, effectiveReqForRedaction)
			errRes.Error.Message = redactSensitiveErrorText(errRes.Error.Message, extraAPIKeys)
		}
		return errRes
	}

	effectiveMaxBody := -1
	if visited["max-body"] {
		effectiveMaxBody = maxBody
	} else if compact {
		effectiveMaxBody = defaultCompactMaxBody
	}
	if redact || compact {
		extraAPIKeys := collectRunAPIKeyNames(coll, pathFolders, effectiveReqForRedaction)
		redactRunOutput(runOut, extraAPIKeys)
	}
	if effectiveMaxBody >= 0 {
		truncateRunOutputBody(runOut, effectiveMaxBody)
	}
	if compact {
		return model.NewSuccess(toCompactRunOutput(runOut))
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

// ============================================================================
// 7. FLOW COMMANDS (`hecto flow`)
// ============================================================================

type flowReferencedRequestSummary struct {
	ID          string `json:"id"`
	Name        string `json:"name,omitempty"`
	Method      string `json:"method,omitempty"`
	URL         string `json:"url,omitempty"`
	PathDisplay string `json:"path_display,omitempty"`
	Missing     bool   `json:"missing,omitempty"`
}

type flowGetOutput struct {
	model.Flow
	ReferencedRequests []flowReferencedRequestSummary `json:"referenced_requests"`
}

func flattenFlowFolderList(nodes []model.FlowTreeNode, prefix string) []folderListEntry {
	out := []folderListEntry{}
	for _, n := range nodes {
		if n.Type == "flow_folder" {
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
				out = append(out, flattenFlowFolderList(n.Children, p)...)
			}
		}
	}
	return out
}

func collectReferencedRequestIDs(nodes []model.FlowNode, seen map[string]bool, ordered *[]string) {
	for _, n := range nodes {
		for _, st := range n.Steps {
			reqID := strings.TrimSpace(st.RequestID)
			if reqID != "" && !seen[reqID] {
				seen[reqID] = true
				*ordered = append(*ordered, reqID)
			}
		}
		for _, br := range n.Branches {
			collectReferencedRequestIDs(br.Nodes, seen, ordered)
		}
	}
}

func (c *cliContext) buildFlowGetOutput(collRoot string, flow model.Flow) flowGetOutput {
	seen := map[string]bool{}
	orderedIDs := []string{}
	collectReferencedRequestIDs(flow.Nodes, seen, &orderedIDs)

	reqLookup := map[string]reqListEntry{}
	if treeRes := c.collSvc.GetTree(collRoot); treeRes.Success {
		if treeNodes, ok := treeRes.Data.([]model.TreeNode); ok {
			for _, entry := range c.flattenRequests(treeNodes, "") {
				reqLookup[entry.ID] = entry
			}
		}
	}

	summaries := make([]flowReferencedRequestSummary, 0, len(orderedIDs))
	for _, reqID := range orderedIDs {
		if entry, ok := reqLookup[reqID]; ok {
			summaries = append(summaries, flowReferencedRequestSummary{
				ID:          entry.ID,
				Name:        entry.Name,
				Method:      entry.Method,
				URL:         entry.URL,
				PathDisplay: entry.PathDisplay,
			})
			continue
		}
		summaries = append(summaries, flowReferencedRequestSummary{
			ID:      reqID,
			Missing: true,
		})
	}

	return flowGetOutput{
		Flow:               flow,
		ReferencedRequests: summaries,
	}
}

// parseFlowStepsFlag parses `--steps "<req1>,<req2>||<req3>,..."` into []model.FlowNode.
// Comma `,` separates sequential FlowNodes; `||` separates parallel FlowSteps within the same FlowNode.
func (c *cliContext) parseFlowStepsFlag(collRoot, raw string) ([]model.FlowNode, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return []model.FlowNode{}, nil
	}

	rowTokens := strings.Split(trimmed, ",")
	nodes := make([]model.FlowNode, 0, len(rowTokens))
	for _, rowTok := range rowTokens {
		rowTok = strings.TrimSpace(rowTok)
		if rowTok == "" {
			return nil, fmt.Errorf("%s: empty step token in --steps %q", model.ErrValidation, raw)
		}
		stepTokens := strings.Split(rowTok, "||")
		steps := make([]model.FlowStep, 0, len(stepTokens))
		for _, stepTok := range stepTokens {
			stepSel := strings.TrimSpace(stepTok)
			if stepSel == "" {
				return nil, fmt.Errorf("%s: empty request selector in --steps %q", model.ErrValidation, raw)
			}
			req, _, _, err := c.collSvc.ResolveRequestSelector(collRoot, stepSel)
			exampleID := ""
			if err != nil {
				if atIdx := strings.LastIndex(stepSel, "@"); atIdx > 0 {
					reqPart := strings.TrimSpace(stepSel[:atIdx])
					exPart := strings.TrimSpace(stepSel[atIdx+1:])
					if reqPart != "" && exPart != "" {
						var reqErr error
						req, _, _, reqErr = c.collSvc.ResolveRequestSelector(collRoot, reqPart)
						if reqErr == nil {
							_, ex, exErr := service.ResolveExampleSelector(req, exPart)
							if exErr != nil {
								return nil, exErr
							}
							exampleID = ex.ID
							err = nil
						} else {
							err = reqErr
						}
					}
				}
			}
			if err != nil {
				return nil, err
			}
			steps = append(steps, model.FlowStep{
				ID:        uuid.NewString(),
				RequestID: req.ID,
				ExampleID: exampleID,
				Enabled:   true,
			})
		}
		if len(steps) > 0 {
			nodes = append(nodes, model.FlowNode{
				ID:    uuid.NewString(),
				Steps: steps,
			})
		}
	}
	return nodes, nil
}

type rawFlowStepJSON struct {
	ID        string `json:"id"`
	RequestID string `json:"request_id"`
	ExampleID string `json:"example_id,omitempty"`
	Enabled   *bool  `json:"enabled"`
	TimeoutMs int    `json:"timeout_ms,omitempty"`
}

type rawFlowBranchJSON struct {
	ID        string                    `json:"id"`
	Name      string                    `json:"name,omitempty"`
	Condition model.FlowBranchCondition `json:"condition"`
	Nodes     []rawFlowNodeJSON         `json:"nodes"`
}

type rawFlowNodeJSON struct {
	ID       string              `json:"id"`
	Steps    []rawFlowStepJSON   `json:"steps"`
	Branches []rawFlowBranchJSON `json:"branches,omitempty"`
}

func (c *cliContext) convertRawFlowNodes(collRoot string, rawNodes []rawFlowNodeJSON) ([]model.FlowNode, error) {
	if len(rawNodes) == 0 {
		return []model.FlowNode{}, nil
	}
	out := make([]model.FlowNode, 0, len(rawNodes))
	for _, rn := range rawNodes {
		nodeID := strings.TrimSpace(rn.ID)
		if nodeID == "" {
			nodeID = uuid.NewString()
		}
		steps := make([]model.FlowStep, 0, len(rn.Steps))
		for _, rs := range rn.Steps {
			if rs.TimeoutMs < 0 {
				return nil, fmt.Errorf("%s: step timeout_ms cannot be negative (%d)", model.ErrValidation, rs.TimeoutMs)
			}
			reqSel := strings.TrimSpace(rs.RequestID)
			if reqSel == "" {
				return nil, fmt.Errorf("%s: step in --nodes-json is missing request_id", model.ErrValidation)
			}
			resolvedReqID := reqSel
			var resolvedReq model.Request
			hasResolvedReq := false
			if req, _, _, err := c.collSvc.ResolveRequestSelector(collRoot, reqSel); err == nil && req.ID != "" {
				resolvedReqID = req.ID
				resolvedReq = req
				hasResolvedReq = true
			} else if _, uuidErr := uuid.Parse(reqSel); uuidErr != nil {
				return nil, err
			}
			resolvedExampleID := strings.TrimSpace(rs.ExampleID)
			if resolvedExampleID != "" && hasResolvedReq {
				if _, ex, exErr := service.ResolveExampleSelector(resolvedReq, resolvedExampleID); exErr == nil {
					resolvedExampleID = ex.ID
				} else if _, uuidErr := uuid.Parse(resolvedExampleID); uuidErr != nil {
					return nil, exErr
				}
			}
			stepID := strings.TrimSpace(rs.ID)
			if stepID == "" {
				stepID = uuid.NewString()
			}
			enabled := true
			if rs.Enabled != nil {
				enabled = *rs.Enabled
			}
			steps = append(steps, model.FlowStep{
				ID:        stepID,
				RequestID: resolvedReqID,
				ExampleID: resolvedExampleID,
				Enabled:   enabled,
				TimeoutMs: rs.TimeoutMs,
			})
		}

		var branches []model.FlowBranch
		if len(rn.Branches) > 0 {
			branches = make([]model.FlowBranch, 0, len(rn.Branches))
			for _, rb := range rn.Branches {
				brID := strings.TrimSpace(rb.ID)
				if brID == "" {
					brID = uuid.NewString()
				}
				childNodes, err := c.convertRawFlowNodes(collRoot, rb.Nodes)
				if err != nil {
					return nil, err
				}
				cond := rb.Condition
				condType := strings.ToLower(strings.TrimSpace(cond.Type))
				if condType == "" {
					condType = "success"
				}
				switch condType {
				case "success", "error":
					cond.Type = condType
				case "custom":
					cond.Type = "custom"
					src := strings.ToLower(strings.TrimSpace(cond.Source))
					switch src {
					case "status_code", "body_json", "variable":
						cond.Source = src
					default:
						return nil, fmt.Errorf("%s: invalid custom branch condition.source %q (expected status_code, body_json, or variable)", model.ErrValidation, cond.Source)
					}
					op := strings.ToLower(strings.TrimSpace(cond.Operator))
					switch op {
					case "==", "!=", ">", "<", ">=", "<=", "contains", "matches", "exists":
						cond.Operator = op
					default:
						return nil, fmt.Errorf("%s: invalid custom branch condition.operator %q (expected ==, !=, >, <, >=, <=, contains, matches, or exists)", model.ErrValidation, cond.Operator)
					}
				default:
					return nil, fmt.Errorf("%s: invalid branch condition.type %q (expected success, error, or custom)", model.ErrValidation, cond.Type)
				}
				branches = append(branches, model.FlowBranch{
					ID:        brID,
					Name:      rb.Name,
					Condition: cond,
					Nodes:     childNodes,
				})
			}
		}

		out = append(out, model.FlowNode{
			ID:       nodeID,
			Steps:    steps,
			Branches: branches,
		})
	}
	return out, nil
}

func (c *cliContext) parseFlowNodesJSONFlag(collRoot, raw string) ([]model.FlowNode, error) {
	content, err := readStringOrFileFlag(raw)
	if err != nil {
		return nil, err
	}
	var rawNodes []rawFlowNodeJSON
	if err := json.Unmarshal([]byte(content), &rawNodes); err != nil {
		return nil, fmt.Errorf("%s: invalid --nodes-json: %v", model.ErrValidation, err)
	}
	return c.convertRawFlowNodes(collRoot, rawNodes)
}

func (c *cliContext) handleFlowFolder(collRoot string, args []string) model.Result {
	if len(args) == 0 {
		return model.NewError(model.ErrValidation, "missing flow folder verb (expected: list|tree|get|create|update|delete|move)")
	}
	verb := strings.ToLower(strings.TrimSpace(args[0]))
	rest := args[1:]

	switch verb {
	case "tree":
		fset := flag.NewFlagSet("flow folder tree", flag.ContinueOnError)
		if _, err := parseSubcommandFlags(fset, rest); err != nil {
			return model.NewError(model.ErrValidation, err.Error())
		}
		return c.flowSvc.GetTree(collRoot)

	case "list", "ls":
		fset := flag.NewFlagSet("flow folder list", flag.ContinueOnError)
		if _, err := parseSubcommandFlags(fset, rest); err != nil {
			return model.NewError(model.ErrValidation, err.Error())
		}
		treeRes := c.flowSvc.GetTree(collRoot)
		if !treeRes.Success {
			return treeRes
		}
		nodes, _ := treeRes.Data.([]model.FlowTreeNode)
		return model.NewSuccess(flattenFlowFolderList(nodes, ""))

	case "get", "show":
		fset := flag.NewFlagSet("flow folder get", flag.ContinueOnError)
		pos, err := parseSubcommandFlags(fset, rest)
		if err != nil {
			return model.NewError(model.ErrValidation, err.Error())
		}
		if len(pos) == 0 {
			return model.NewError(model.ErrValidation, "flow folder selector <id|path> is required")
		}
		node, _, err := c.flowSvc.ResolveFlowFolderSelector(collRoot, pos[0])
		if err != nil {
			return resultFromError(err)
		}
		return c.flowSvc.LoadFlowFolder(node.ID)

	case "create", "add":
		fset := flag.NewFlagSet("flow folder create", flag.ContinueOnError)
		var name, parentSel string
		fset.StringVar(&name, "name", "", "Flow folder name")
		fset.StringVar(&parentSel, "parent", "", "Parent flow folder <id|path>")

		pos, err := parseSubcommandFlags(fset, rest)
		if err != nil {
			return model.NewError(model.ErrValidation, err.Error())
		}
		if strings.TrimSpace(name) == "" && len(pos) > 0 {
			name = pos[0]
		}
		if strings.TrimSpace(name) == "" {
			return model.NewError(model.ErrValidation, "--name is required for `flow folder create`")
		}

		parentID := ""
		trimmedParent := strings.TrimSpace(parentSel)
		if trimmedParent != "" && !strings.EqualFold(trimmedParent, "root") && trimmedParent != "/" {
			parentNode, _, err := c.flowSvc.ResolveFlowFolderSelector(collRoot, trimmedParent)
			if err != nil {
				return resultFromError(err)
			}
			parentID = parentNode.ID
		}
		return c.flowSvc.CreateFlowFolderNamed(collRoot, parentID, strings.TrimSpace(name))

	case "update", "patch", "rename":
		fset := flag.NewFlagSet("flow folder update", flag.ContinueOnError)
		var name string
		fset.StringVar(&name, "name", "", "New flow folder name")

		pos, err := parseSubcommandFlags(fset, rest)
		if err != nil {
			return model.NewError(model.ErrValidation, err.Error())
		}
		if len(pos) == 0 {
			return model.NewError(model.ErrValidation, "flow folder selector <id|path> is required")
		}
		visited := visitedFlagsMap(fset)
		if !visited["name"] || strings.TrimSpace(name) == "" {
			return model.NewError(model.ErrValidation, "--name is required for `flow folder update`")
		}
		node, _, err := c.flowSvc.ResolveFlowFolderSelector(collRoot, pos[0])
		if err != nil {
			return resultFromError(err)
		}
		return c.flowSvc.RenameFlowFolder(node.ID, strings.TrimSpace(name))

	case "delete", "rm":
		fset := flag.NewFlagSet("flow folder delete", flag.ContinueOnError)
		pos, err := parseSubcommandFlags(fset, rest)
		if err != nil {
			return model.NewError(model.ErrValidation, err.Error())
		}
		if len(pos) == 0 {
			return model.NewError(model.ErrValidation, "flow folder selector <id|path> is required")
		}
		node, _, err := c.flowSvc.ResolveFlowFolderSelector(collRoot, pos[0])
		if err != nil {
			return resultFromError(err)
		}
		delRes := c.flowSvc.DeleteFlowFolder(collRoot, node.ID)
		if !delRes.Success {
			return delRes
		}
		return model.NewSuccess(map[string]interface{}{
			"deleted_id": node.ID,
			"name":       node.Name,
		})

	case "move", "mv":
		fset := flag.NewFlagSet("flow folder move", flag.ContinueOnError)
		var toSel string
		fset.StringVar(&toSel, "to", "", "Target parent flow folder <id|path|root>")
		pos, err := parseSubcommandFlags(fset, rest)
		if err != nil {
			return model.NewError(model.ErrValidation, err.Error())
		}
		if len(pos) == 0 {
			return model.NewError(model.ErrValidation, "flow folder selector <id|path> is required")
		}
		visited := visitedFlagsMap(fset)
		if !visited["to"] {
			return model.NewError(model.ErrValidation, "--to <target-id|path|root> is required for `flow folder move`")
		}
		node, _, err := c.flowSvc.ResolveFlowFolderSelector(collRoot, pos[0])
		if err != nil {
			return resultFromError(err)
		}
		targetParentID := ""
		trimmedTo := strings.TrimSpace(toSel)
		if trimmedTo != "" && !strings.EqualFold(trimmedTo, "root") && trimmedTo != "/" {
			targetNode, _, err := c.flowSvc.ResolveFlowFolderSelector(collRoot, trimmedTo)
			if err != nil {
				return resultFromError(err)
			}
			targetParentID = targetNode.ID
		}
		moveRes := c.flowSvc.MoveNode(collRoot, node.ID, targetParentID, -1)
		if !moveRes.Success {
			return moveRes
		}
		return c.flowSvc.LoadFlowFolder(node.ID)

	default:
		return model.NewError(model.ErrValidation, fmt.Sprintf("unknown flow folder verb %q (expected: list|tree|get|create|update|delete|move)", verb))
	}
}

func (c *cliContext) handleFlow(args []string) model.Result {
	if len(args) == 0 {
		return model.NewError(model.ErrValidation, "missing flow verb (expected: list|tree|get|create|update|delete|move|folder|run)")
	}
	verb := strings.ToLower(strings.TrimSpace(args[0]))
	rest := args[1:]

	coll, collRoot, err := c.resolveTargetCollection("")
	if err != nil {
		return resultFromError(err)
	}

	switch verb {
	case "folder", "folders":
		return c.handleFlowFolder(collRoot, rest)

	case "tree":
		fset := flag.NewFlagSet("flow tree", flag.ContinueOnError)
		if _, err := parseSubcommandFlags(fset, rest); err != nil {
			return model.NewError(model.ErrValidation, err.Error())
		}
		return c.flowSvc.GetTree(collRoot)

	case "list", "ls":
		fset := flag.NewFlagSet("flow list", flag.ContinueOnError)
		var folderSel string
		fset.StringVar(&folderSel, "folder", "", "Filter flows by flow folder <id|path>")
		if _, err := parseSubcommandFlags(fset, rest); err != nil {
			return model.NewError(model.ErrValidation, err.Error())
		}
		folderID := ""
		trimmedFolder := strings.TrimSpace(folderSel)
		if trimmedFolder != "" && !strings.EqualFold(trimmedFolder, "root") && trimmedFolder != "/" {
			fNode, _, err := c.flowSvc.ResolveFlowFolderSelector(collRoot, trimmedFolder)
			if err != nil {
				return resultFromError(err)
			}
			folderID = fNode.ID
		}
		return c.flowSvc.ListFlows(collRoot, folderID)

	case "get", "show":
		fset := flag.NewFlagSet("flow get", flag.ContinueOnError)
		pos, err := parseSubcommandFlags(fset, rest)
		if err != nil {
			return model.NewError(model.ErrValidation, err.Error())
		}
		if len(pos) == 0 {
			return model.NewError(model.ErrValidation, "flow selector <id|path> is required")
		}
		flow, _, err := c.flowSvc.ResolveFlowSelector(collRoot, pos[0])
		if err != nil {
			return resultFromError(err)
		}
		return model.NewSuccess(c.buildFlowGetOutput(collRoot, flow))

	case "create", "add":
		fset := flag.NewFlagSet("flow create", flag.ContinueOnError)
		var name, folderSel, desc, descAlias, layout, directionAlias, stepsRaw, nodesJSONRaw string
		var timeoutMs, maxSteps int
		fset.StringVar(&name, "name", "", "Flow name")
		fset.StringVar(&folderSel, "folder", "", "Parent flow folder <id|path>")
		fset.StringVar(&desc, "desc", "", "Flow description")
		fset.StringVar(&descAlias, "description", "", "Flow description")
		fset.StringVar(&layout, "layout", "vertical", "Flow layout (vertical|horizontal)")
		fset.StringVar(&directionAlias, "direction", "", "Flow layout alias (vertical|horizontal)")
		fset.IntVar(&timeoutMs, "timeout-ms", service.DefaultFlowTimeoutMs, "Default per-step timeout in ms")
		fset.IntVar(&maxSteps, "max-steps", service.DefaultFlowMaxSteps, "Maximum steps executed per run")
		fset.StringVar(&stepsRaw, "steps", "", "Shorthand steps: '<req1>,<req2>||<req3>'")
		fset.StringVar(&nodesJSONRaw, "nodes-json", "", "Full FlowNode[] JSON string or @filepath")

		pos, err := parseSubcommandFlags(fset, rest)
		if err != nil {
			return model.NewError(model.ErrValidation, err.Error())
		}
		if strings.TrimSpace(name) == "" && len(pos) > 0 {
			name = pos[0]
		}
		if strings.TrimSpace(name) == "" {
			return model.NewError(model.ErrValidation, "--name is required for `flow create`")
		}

		visited := visitedFlagsMap(fset)
		if visited["description"] && !visited["desc"] {
			desc = descAlias
		}
		if visited["direction"] && !visited["layout"] {
			layout = directionAlias
		}
		normLayout := strings.ToLower(strings.TrimSpace(layout))
		if normLayout == "" {
			normLayout = "vertical"
		}
		if normLayout != "vertical" && normLayout != "horizontal" {
			return model.NewError(model.ErrValidation, fmt.Sprintf("invalid --layout %q (expected vertical or horizontal)", layout))
		}
		if visited["timeout-ms"] && timeoutMs <= 0 {
			return model.NewError(model.ErrValidation, "--timeout-ms must be a positive integer")
		}
		if visited["max-steps"] && maxSteps <= 0 {
			return model.NewError(model.ErrValidation, "--max-steps must be a positive integer")
		}
		if visited["steps"] && visited["nodes-json"] {
			return model.NewError(model.ErrValidation, "cannot specify both --steps and --nodes-json")
		}

		parentFolderID := ""
		trimmedFolder := strings.TrimSpace(folderSel)
		if trimmedFolder != "" && !strings.EqualFold(trimmedFolder, "root") && trimmedFolder != "/" {
			fNode, _, err := c.flowSvc.ResolveFlowFolderSelector(collRoot, trimmedFolder)
			if err != nil {
				return resultFromError(err)
			}
			parentFolderID = fNode.ID
		}

		nodes := []model.FlowNode{}
		if visited["steps"] {
			parsedNodes, err := c.parseFlowStepsFlag(collRoot, stepsRaw)
			if err != nil {
				return resultFromError(err)
			}
			nodes = parsedNodes
		} else if visited["nodes-json"] {
			parsedNodes, err := c.parseFlowNodesJSONFlag(collRoot, nodesJSONRaw)
			if err != nil {
				return resultFromError(err)
			}
			nodes = parsedNodes
		}

		return c.flowSvc.CreateFlowWithDetails(collRoot, parentFolderID, model.Flow{
			Name:        strings.TrimSpace(name),
			Description: desc,
			Layout:      normLayout,
			TimeoutMs:   timeoutMs,
			MaxSteps:    maxSteps,
			Nodes:       nodes,
		})

	case "update", "patch":
		fset := flag.NewFlagSet("flow update", flag.ContinueOnError)
		var name, desc, descAlias, layout, directionAlias, folderSel, stepsRaw, nodesJSONRaw string
		var timeoutMs, maxSteps int
		fset.StringVar(&name, "name", "", "New flow name")
		fset.StringVar(&desc, "desc", "", "Flow description")
		fset.StringVar(&descAlias, "description", "", "Flow description")
		fset.StringVar(&layout, "layout", "", "Flow layout (vertical|horizontal)")
		fset.StringVar(&directionAlias, "direction", "", "Flow layout alias (vertical|horizontal)")
		fset.StringVar(&folderSel, "folder", "", "Target flow folder <id|path|root>")
		fset.IntVar(&timeoutMs, "timeout-ms", 0, "Default per-step timeout in ms")
		fset.IntVar(&maxSteps, "max-steps", 0, "Maximum steps executed per run")
		fset.StringVar(&stepsRaw, "steps", "", "Shorthand steps: '<req1>,<req2>||<req3>'")
		fset.StringVar(&nodesJSONRaw, "nodes-json", "", "Full FlowNode[] JSON string or @filepath")

		pos, err := parseSubcommandFlags(fset, rest)
		if err != nil {
			return model.NewError(model.ErrValidation, err.Error())
		}
		if len(pos) == 0 {
			return model.NewError(model.ErrValidation, "flow selector <id|path> is required for `flow update`")
		}

		visited := visitedFlagsMap(fset)
		hasUpdateFlag := visited["name"] ||
			visited["desc"] ||
			visited["description"] ||
			visited["layout"] ||
			visited["direction"] ||
			visited["timeout-ms"] ||
			visited["max-steps"] ||
			visited["steps"] ||
			visited["nodes-json"] ||
			visited["folder"]
		if !hasUpdateFlag {
			return model.NewError(model.ErrValidation, "at least one update flag (--name, --desc, --layout, --timeout-ms, --max-steps, --steps, --nodes-json, --folder) is required for `flow update`")
		}

		flow, _, err := c.flowSvc.ResolveFlowSelector(collRoot, pos[0])
		if err != nil {
			return resultFromError(err)
		}

		if visited["steps"] && visited["nodes-json"] {
			return model.NewError(model.ErrValidation, "cannot specify both --steps and --nodes-json")
		}
		if visited["name"] {
			if strings.TrimSpace(name) == "" {
				return model.NewError(model.ErrValidation, "flow name cannot be empty")
			}
			flow.Name = strings.TrimSpace(name)
		}
		if visited["desc"] {
			flow.Description = desc
		} else if visited["description"] {
			flow.Description = descAlias
		}
		if visited["layout"] || visited["direction"] {
			rawLayout := layout
			if !visited["layout"] {
				rawLayout = directionAlias
			}
			normLayout := strings.ToLower(strings.TrimSpace(rawLayout))
			if normLayout != "vertical" && normLayout != "horizontal" {
				return model.NewError(model.ErrValidation, fmt.Sprintf("invalid --layout %q (expected vertical or horizontal)", rawLayout))
			}
			flow.Layout = normLayout
		}
		if visited["timeout-ms"] {
			if timeoutMs <= 0 {
				return model.NewError(model.ErrValidation, "--timeout-ms must be a positive integer")
			}
			flow.TimeoutMs = timeoutMs
		}
		if visited["max-steps"] {
			if maxSteps <= 0 {
				return model.NewError(model.ErrValidation, "--max-steps must be a positive integer")
			}
			flow.MaxSteps = maxSteps
		}
		if visited["steps"] {
			parsedNodes, err := c.parseFlowStepsFlag(collRoot, stepsRaw)
			if err != nil {
				return resultFromError(err)
			}
			flow.Nodes = parsedNodes
		} else if visited["nodes-json"] {
			parsedNodes, err := c.parseFlowNodesJSONFlag(collRoot, nodesJSONRaw)
			if err != nil {
				return resultFromError(err)
			}
			flow.Nodes = parsedNodes
		}
		if visited["folder"] {
			targetFolderID := ""
			trimmedTo := strings.TrimSpace(folderSel)
			if trimmedTo != "" && !strings.EqualFold(trimmedTo, "root") && trimmedTo != "/" {
				targetNode, _, err := c.flowSvc.ResolveFlowFolderSelector(collRoot, trimmedTo)
				if err != nil {
					return resultFromError(err)
				}
				targetFolderID = targetNode.ID
			}
			if moveRes := c.flowSvc.MoveNode(collRoot, flow.ID, targetFolderID, -1); !moveRes.Success {
				return moveRes
			}
		}

		return c.flowSvc.SaveFlow(flow)

	case "delete", "rm":
		fset := flag.NewFlagSet("flow delete", flag.ContinueOnError)
		pos, err := parseSubcommandFlags(fset, rest)
		if err != nil {
			return model.NewError(model.ErrValidation, err.Error())
		}
		if len(pos) == 0 {
			return model.NewError(model.ErrValidation, "flow selector <id|path> is required")
		}
		flow, _, err := c.flowSvc.ResolveFlowSelector(collRoot, pos[0])
		if err != nil {
			return resultFromError(err)
		}
		delRes := c.flowSvc.DeleteFlow(flow.ID)
		if !delRes.Success {
			return delRes
		}
		return model.NewSuccess(map[string]interface{}{
			"deleted_id": flow.ID,
			"name":       flow.Name,
		})

	case "move", "mv":
		fset := flag.NewFlagSet("flow move", flag.ContinueOnError)
		var toSel string
		fset.StringVar(&toSel, "to", "", "Target flow folder <id|path|root>")
		pos, err := parseSubcommandFlags(fset, rest)
		if err != nil {
			return model.NewError(model.ErrValidation, err.Error())
		}
		if len(pos) == 0 {
			return model.NewError(model.ErrValidation, "flow selector <id|path> is required")
		}
		visited := visitedFlagsMap(fset)
		if !visited["to"] {
			return model.NewError(model.ErrValidation, "--to <folder-id|path|root> is required for `flow move`")
		}
		flow, _, err := c.flowSvc.ResolveFlowSelector(collRoot, pos[0])
		if err != nil {
			return resultFromError(err)
		}
		targetFolderID := ""
		trimmedTo := strings.TrimSpace(toSel)
		if trimmedTo != "" && !strings.EqualFold(trimmedTo, "root") && trimmedTo != "/" {
			targetNode, _, err := c.flowSvc.ResolveFlowFolderSelector(collRoot, trimmedTo)
			if err != nil {
				return resultFromError(err)
			}
			targetFolderID = targetNode.ID
		}
		moveRes := c.flowSvc.MoveNode(collRoot, flow.ID, targetFolderID, -1)
		if !moveRes.Success {
			return moveRes
		}
		return c.flowSvc.GetFlow(flow.ID)

	case "run":
		fset := flag.NewFlagSet("flow run", flag.ContinueOnError)
		var envSel, exampleSel string
		var cliVars multiStringFlag
		var timeoutMs, maxBody int
		var noSaveEnv, compact, redact bool

		fset.StringVar(&envSel, "env", "", "Environment override <id|name|none>")
		fset.StringVar(&exampleSel, "example", "", "Example <id|name> override")
		fset.Var(&cliVars, "var", "Runtime variable override K=V")
		fset.IntVar(&timeoutMs, "timeout-ms", 0, "Per-step HTTP timeout override in milliseconds")
		fset.BoolVar(&noSaveEnv, "no-save-env", false, "Do not persist script variable/auth mutations to disk")
		fset.BoolVar(&compact, "compact", false, "Emit compact, redacted output for AI agents")
		fset.BoolVar(&redact, "redact", false, "Mask sensitive headers, variables, and auth secrets on stdout")
		fset.IntVar(&maxBody, "max-body", -1, "Truncate step response body on stdout at max bytes")

		pos, err := parseSubcommandFlags(fset, rest)
		if err != nil {
			return model.NewError(model.ErrValidation, err.Error())
		}
		if len(pos) == 0 {
			return model.NewError(model.ErrValidation, "flow selector <id|path> is required for `hecto flow run`")
		}
		if err := rejectUnexpectedPositionals(pos, 1); err != nil {
			return resultFromError(err)
		}

		visited := visitedFlagsMap(fset)
		if visited["timeout-ms"] && timeoutMs <= 0 {
			return model.NewError(model.ErrValidation, "--timeout-ms must be a positive integer (milliseconds)")
		}
		if visited["max-body"] && maxBody < 0 {
			return model.NewError(model.ErrValidation, "--max-body must be a non-negative integer (bytes)")
		}

		flow, _, err := c.flowSvc.ResolveFlowSelector(collRoot, pos[0])
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

		flowOut, err := engine.ExecuteFlow(engine.FlowRunOptions{
			FS:              c.fs,
			CollectionSvc:   c.collSvc,
			EnvSvc:          c.envSvc,
			RequestSvc:      c.reqSvc,
			FlowSvc:         c.flowSvc,
			ExecutorSvc:     c.execSvc,
			CollectionsRoot: c.cfg.CollectionsRoot,
			CollectionRoot:  collRoot,
			Collection:      coll,
			Flow:            flow,
			ExampleSelector: exampleSel,
			ActiveEnvID:     activeEnvID,
			CLIVarOverrides: overrides,
			TimeoutMs:       timeoutMs,
			NoSaveEnv:       noSaveEnv,
		})
		if err != nil {
			errRes := resultFromError(err)
			if (redact || compact) && errRes.Error != nil {
				extraAPIKeys := collectFlowAPIKeyNames(c.collSvc, c.reqSvc, collRoot, coll, flow)
				errRes.Error.Message = redactSensitiveErrorText(errRes.Error.Message, extraAPIKeys)
			}
			return errRes
		}

		effectiveMaxBody := -1
		if visited["max-body"] {
			effectiveMaxBody = maxBody
		} else if compact {
			effectiveMaxBody = defaultCompactMaxBody
		}
		if redact || compact {
			extraAPIKeys := collectFlowAPIKeyNames(c.collSvc, c.reqSvc, collRoot, coll, flow)
			walkUniqueFlowRunOutputs(flowOut, func(ro *engine.RunOutput) {
				redactRunOutput(ro, extraAPIKeys)
			})
			flowOut.HaltedError = redactSensitiveErrorText(flowOut.HaltedError, extraAPIKeys)
			for i := range flowOut.NodeResults {
				for j := range flowOut.NodeResults[i].StepResults {
					flowOut.NodeResults[i].StepResults[j].FailureReason = redactSensitiveErrorText(flowOut.NodeResults[i].StepResults[j].FailureReason, extraAPIKeys)
				}
			}
			for i := range flowOut.StepResults {
				flowOut.StepResults[i].FailureReason = redactSensitiveErrorText(flowOut.StepResults[i].FailureReason, extraAPIKeys)
			}
		}
		if compact {
			showPassedBody := visited["max-body"] && maxBody > 0
			return model.NewSuccess(toCompactFlowRunOutput(flowOut, showPassedBody, effectiveMaxBody))
		}
		if effectiveMaxBody >= 0 {
			walkUniqueFlowRunOutputs(flowOut, func(ro *engine.RunOutput) {
				truncateRunOutputBody(ro, effectiveMaxBody)
			})
		}
		return model.NewSuccess(flowOut)

	default:
		return model.NewError(model.ErrValidation, fmt.Sprintf("unknown flow verb %q (expected: list|tree|get|create|update|delete|move|folder|run)", verb))
	}
}

// ============================================================================
// 8. MOCK SERVER COMMANDS (`hecto mock`)
// ============================================================================

const (
	mockDaemonFileName       = "mock-daemon.json"
	mockInternalDaemonEnv    = "HECTO_INTERNAL_MOCK_DAEMON"
	mockDaemonHandshakeFDEnv = "HECTO_MOCK_HANDSHAKE_FD"
)

type mockDaemonState struct {
	PID          int       `json:"pid"`
	Port         int       `json:"port"`
	BaseURL      string    `json:"base_url"`
	CollectionID string    `json:"collection_id"`
	CollRoot     string    `json:"coll_root"`
	StartedAt    time.Time `json:"started_at"`
}

type mockStatusOutput struct {
	Running        bool              `json:"running"`
	Port           int               `json:"port"`
	ConfiguredPort int               `json:"configured_port,omitempty"`
	BaseURL        string            `json:"base_url"`
	Routes         []model.MockRoute `json:"routes"`
	PID            int               `json:"pid,omitempty"`
	CollectionID   string            `json:"collection_id,omitempty"`
	CollRoot       string            `json:"coll_root,omitempty"`
	StartedAt      *time.Time        `json:"started_at,omitempty"`
	ActiveDaemon   *mockDaemonState  `json:"active_daemon,omitempty"`
	Stopped        *bool             `json:"stopped,omitempty"`
}

type mockDaemonHandshake struct {
	Success bool              `json:"success"`
	Status  *mockStatusOutput `json:"status,omitempty"`
	Error   *model.AppError   `json:"error,omitempty"`
}

func normalizeMockMethod(raw string) (string, error) {
	upper := strings.ToUpper(strings.TrimSpace(raw))
	if upper == "" {
		return "GET", nil
	}
	switch upper {
	case "GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD", "ANY":
		return upper, nil
	default:
		return "", fmt.Errorf("%s: invalid --method %q (expected GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD, or ANY)", model.ErrValidation, raw)
	}
}

func validateMockPort(port int) error {
	if port < 1024 || port > 65535 {
		return fmt.Errorf("%s: --port must be between 1024 and 65535, got %d", model.ErrValidation, port)
	}
	return nil
}

func validateMockStatusCode(code int) error {
	if code < 100 || code > 599 {
		return fmt.Errorf("%s: --status-code must be between 100 and 599, got %d", model.ErrValidation, code)
	}
	return nil
}

func validateMockDelayMs(delay int64) error {
	if delay < 0 || delay > 30000 {
		return fmt.Errorf("%s: --delay-ms must be between 0 and 30000, got %d", model.ErrValidation, delay)
	}
	return nil
}

func upsertHeaderKVPair(list []model.KVPair, key, val string) []model.KVPair {
	normKey := strings.TrimSpace(key)
	out := make([]model.KVPair, 0, len(list)+1)
	updated := false
	for _, item := range list {
		if strings.EqualFold(strings.TrimSpace(item.Key), normKey) {
			if !updated {
				item.Key = normKey
				item.Value = val
				item.Enabled = true
				out = append(out, item)
				updated = true
			}
			continue
		}
		out = append(out, item)
	}
	if !updated {
		out = append(out, model.KVPair{Key: normKey, Value: val, Enabled: true})
	}
	return out
}

func removeHeaderKVPair(list []model.KVPair, key string) []model.KVPair {
	if len(list) == 0 {
		return []model.KVPair{}
	}
	normKey := strings.TrimSpace(key)
	out := make([]model.KVPair, 0, len(list))
	for _, item := range list {
		if !strings.EqualFold(strings.TrimSpace(item.Key), normKey) {
			out = append(out, item)
		}
	}
	return out
}

func resolveMockRouteSelector(routes []model.MockRoute, rawSelector string) (int, model.MockRoute, error) {
	sel := strings.TrimSpace(rawSelector)
	if sel == "" {
		return -1, model.MockRoute{}, fmt.Errorf("%s: route selector <id|\"METHOD /path\"> is required", model.ErrValidation)
	}

	for i, rt := range routes {
		if rt.ID == sel {
			return i, rt, nil
		}
	}

	fields := strings.Fields(sel)
	if len(fields) == 2 {
		method, err := normalizeMockMethod(fields[0])
		if err == nil {
			cleanPath := service.CleanMockPath(fields[1])
			var matches []int
			for i, rt := range routes {
				if strings.EqualFold(strings.TrimSpace(rt.Method), method) && service.CleanMockPath(rt.Path) == cleanPath {
					matches = append(matches, i)
				}
			}
			if len(matches) == 1 {
				idx := matches[0]
				return idx, routes[idx], nil
			}
			if len(matches) > 1 {
				ids := make([]string, 0, len(matches))
				for _, idx := range matches {
					ids = append(ids, routes[idx].ID)
				}
				return -1, model.MockRoute{}, fmt.Errorf(
					"%s: multiple mock routes match %q (IDs: %s); specify a route ID",
					model.ErrValidation, sel, strings.Join(ids, ", "),
				)
			}
		}
	}

	return -1, model.MockRoute{}, fmt.Errorf("%s: mock route %q not found", model.ErrNotFound, sel)
}

func isLinuxZombieProcess(pid int) bool {
	raw, err := os.ReadFile(fmt.Sprintf("/proc/%d/stat", pid))
	if err != nil {
		return false
	}
	s := string(raw)
	idx := strings.LastIndex(s, ") ")
	if idx < 0 || idx+2 >= len(s) {
		return false
	}
	state := s[idx+2]
	return state == 'Z' || state == 'X'
}

func isProcessAlive(pid int) bool {
	if pid <= 0 {
		return false
	}
	if err := syscall.Kill(pid, 0); err != nil {
		return err == syscall.EPERM
	}
	// On Linux, kill(pid, 0) succeeds for unreaped zombie children until waited.
	return !isLinuxZombieProcess(pid)
}

func normalizeAbsPath(p string) string {
	trimmed := strings.TrimSpace(p)
	if trimmed == "" {
		return ""
	}
	if abs, err := filepath.Abs(trimmed); err == nil {
		return abs
	}
	return filepath.Clean(trimmed)
}

func isTCPPortListening(port int, timeout time.Duration) bool {
	if port <= 0 || port > 65535 {
		return false
	}
	conn, err := net.DialTimeout("tcp", fmt.Sprintf("127.0.0.1:%d", port), timeout)
	if err != nil {
		return false
	}
	_ = conn.Close()
	return true
}

func (c *cliContext) mockDaemonPath() (string, error) {
	dir, err := c.cfgSvc.ConfigDir()
	if err != nil {
		return "", fmt.Errorf("%s: failed to resolve config directory: %v", model.ErrIO, err)
	}
	return filepath.Join(dir, mockDaemonFileName), nil
}

func (c *cliContext) inspectMockDaemon() (*mockDaemonState, bool, string, error) {
	daemonPath, err := c.mockDaemonPath()
	if err != nil {
		return nil, false, "", err
	}
	raw, err := os.ReadFile(daemonPath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, false, daemonPath, nil
		}
		return nil, false, daemonPath, fmt.Errorf("%s: failed to read %s: %v", model.ErrIO, daemonPath, err)
	}
	var state mockDaemonState
	if err := json.Unmarshal(raw, &state); err != nil || state.PID <= 0 {
		_ = os.Remove(daemonPath)
		return nil, false, daemonPath, nil
	}
	if state.PID == os.Getpid() || !isProcessAlive(state.PID) || !isTCPPortListening(state.Port, 50*time.Millisecond) {
		_ = os.Remove(daemonPath)
		return nil, false, daemonPath, nil
	}
	return &state, true, daemonPath, nil
}

func stopDaemonProcess(daemonPath string, state *mockDaemonState) error {
	if state == nil || state.PID <= 0 || state.PID == os.Getpid() || !isProcessAlive(state.PID) {
		_ = os.Remove(daemonPath)
		return nil
	}
	if err := syscall.Kill(state.PID, syscall.SIGTERM); err != nil {
		if err == syscall.ESRCH {
			_ = os.Remove(daemonPath)
			return nil
		}
		return fmt.Errorf("%s: failed to stop mock daemon (pid %d): %v", model.ErrIO, state.PID, err)
	}

	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		if !isProcessAlive(state.PID) {
			_ = os.Remove(daemonPath)
			return nil
		}
		time.Sleep(20 * time.Millisecond)
	}

	if err := syscall.Kill(state.PID, syscall.SIGKILL); err != nil && err != syscall.ESRCH {
		return fmt.Errorf("%s: failed to force-stop mock daemon (pid %d): %v", model.ErrIO, state.PID, err)
	}
	killDeadline := time.Now().Add(1 * time.Second)
	for time.Now().Before(killDeadline) {
		if !isProcessAlive(state.PID) {
			_ = os.Remove(daemonPath)
			return nil
		}
		time.Sleep(20 * time.Millisecond)
	}
	return fmt.Errorf("%s: mock daemon (pid %d) did not terminate", model.ErrIO, state.PID)
}

func (c *cliContext) stopExistingMockDaemon() (bool, error) {
	state, alive, daemonPath, err := c.inspectMockDaemon()
	if err != nil {
		return false, err
	}
	if !alive || state == nil {
		return false, nil
	}
	if err := stopDaemonProcess(daemonPath, state); err != nil {
		return false, err
	}
	return true, nil
}

func removeMockDaemonFileIfOwned(daemonPath string, ownerPID int) {
	raw, err := os.ReadFile(daemonPath)
	if err != nil {
		return
	}
	var state mockDaemonState
	if err := json.Unmarshal(raw, &state); err == nil && state.PID == ownerPID {
		_ = os.Remove(daemonPath)
	}
}

func (c *cliContext) buildMockStatus(coll model.Collection, collRoot string) (mockStatusOutput, error) {
	stRes := c.mockSvc.GetStatus(collRoot)
	if !stRes.Success {
		if stRes.Error != nil {
			return mockStatusOutput{}, fmt.Errorf("%s: %s", stRes.Error.Code, stRes.Error.Message)
		}
		return mockStatusOutput{}, fmt.Errorf("%s: failed to read mock server status", model.ErrIO)
	}
	svcStatus := stRes.Data.(model.MockServerStatus)
	routes := svcStatus.Routes
	if routes == nil {
		routes = []model.MockRoute{}
	}

	absCollRoot := normalizeAbsPath(collRoot)
	out := mockStatusOutput{
		Running:      false,
		Port:         svcStatus.Port,
		BaseURL:      svcStatus.BaseURL,
		Routes:       routes,
		CollectionID: coll.ID,
		CollRoot:     absCollRoot,
	}

	daemonState, alive, _, err := c.inspectMockDaemon()
	if err != nil {
		return mockStatusOutput{}, err
	}
	if alive && daemonState != nil {
		if normalizeAbsPath(daemonState.CollRoot) == absCollRoot {
			out.Running = true
			out.Port = daemonState.Port
			if svcStatus.Port != out.Port {
				out.ConfiguredPort = svcStatus.Port
			}
			out.BaseURL = daemonState.BaseURL
			if out.BaseURL == "" {
				out.BaseURL = fmt.Sprintf("http://127.0.0.1:%d", out.Port)
			}
			out.PID = daemonState.PID
			started := daemonState.StartedAt
			out.StartedAt = &started
		} else {
			daemonCopy := *daemonState
			out.ActiveDaemon = &daemonCopy
		}
	}

	return out, nil
}

func handshakeFileFromEnv() (*os.File, bool) {
	fdStr := strings.TrimSpace(os.Getenv(mockDaemonHandshakeFDEnv))
	if fdStr == "" {
		return nil, false
	}
	fd, err := strconv.Atoi(fdStr)
	if err != nil || fd < 3 {
		return nil, false
	}
	f := os.NewFile(uintptr(fd), "mock-handshake")
	if f == nil {
		return nil, false
	}
	return f, true
}

func writeDaemonHandshakeError(res model.Result) {
	f, ok := handshakeFileFromEnv()
	if !ok {
		return
	}
	defer f.Close()
	errObj := res.Error
	if errObj == nil {
		errObj = &model.AppError{Code: model.ErrIO, Message: "mock daemon startup failed"}
	}
	_ = json.NewEncoder(f).Encode(mockDaemonHandshake{
		Success: false,
		Error:   errObj,
	})
}

func writeDaemonHandshakeSuccess(f *os.File, status mockStatusOutput) {
	if f == nil {
		return
	}
	_ = json.NewEncoder(f).Encode(mockDaemonHandshake{
		Success: true,
		Status:  &status,
	})
	_ = f.Close()
}

func readDaemonHandshake(rPipe *os.File, timeout time.Duration) (mockDaemonHandshake, error) {
	type readResult struct {
		data []byte
		err  error
	}
	ch := make(chan readResult, 1)
	go func() {
		b, err := io.ReadAll(rPipe)
		ch <- readResult{data: b, err: err}
	}()

	select {
	case res := <-ch:
		_ = rPipe.Close()
		if res.err != nil {
			return mockDaemonHandshake{}, fmt.Errorf("%s: failed reading mock daemon handshake: %v", model.ErrIO, res.err)
		}
		if len(bytes.TrimSpace(res.data)) == 0 {
			return mockDaemonHandshake{}, fmt.Errorf("%s: mock daemon exited before becoming ready", model.ErrIO)
		}
		var hs mockDaemonHandshake
		if err := json.Unmarshal(res.data, &hs); err != nil {
			return mockDaemonHandshake{}, fmt.Errorf("%s: invalid mock daemon handshake payload: %v", model.ErrIO, err)
		}
		return hs, nil
	case <-time.After(timeout):
		_ = rPipe.Close()
		return mockDaemonHandshake{}, fmt.Errorf("%s: timed out waiting for mock daemon startup", model.ErrTimeout)
	}
}

func waitTCPReady(port int, timeout time.Duration) error {
	addr := fmt.Sprintf("127.0.0.1:%d", port)
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		conn, err := net.DialTimeout("tcp", addr, 150*time.Millisecond)
		if err == nil {
			_ = conn.Close()
			return nil
		}
		time.Sleep(15 * time.Millisecond)
	}
	return fmt.Errorf("%s: mock server did not become TCP-ready on %s", model.ErrIO, addr)
}

func startMockConfigWatcher(collRoot string, onChange func()) (func(), error) {
	fsw, err := fsnotify.NewWatcher()
	if err != nil {
		return nil, err
	}
	cleanRoot := filepath.Clean(collRoot)
	if err := fsw.Add(cleanRoot); err != nil {
		_ = fsw.Close()
		return nil, err
	}

	var mu sync.Mutex
	var debounceTimer *time.Timer
	stopCh := make(chan struct{})
	closed := false

	go func() {
		for {
			select {
			case <-stopCh:
				return
			case ev, ok := <-fsw.Events:
				if !ok {
					return
				}
				if filepath.Base(ev.Name) != "mock-server.json" {
					continue
				}
				if ev.Op&(fsnotify.Create|fsnotify.Write|fsnotify.Rename|fsnotify.Remove) == 0 {
					continue
				}
				mu.Lock()
				if closed {
					mu.Unlock()
					continue
				}
				if debounceTimer != nil {
					debounceTimer.Stop()
				}
				var t *time.Timer
				t = time.AfterFunc(25*time.Millisecond, func() {
					mu.Lock()
					valid := !closed && debounceTimer == t
					if valid {
						debounceTimer = nil
					}
					mu.Unlock()
					if valid && onChange != nil {
						onChange()
					}
				})
				debounceTimer = t
				mu.Unlock()
			case _, ok := <-fsw.Errors:
				if !ok {
					return
				}
			}
		}
	}()

	return func() {
		mu.Lock()
		if closed {
			mu.Unlock()
			return
		}
		closed = true
		if debounceTimer != nil {
			debounceTimer.Stop()
			debounceTimer = nil
		}
		close(stopCh)
		_ = fsw.Close()
		mu.Unlock()
	}, nil
}

func rejectUnexpectedPositionals(pos []string, maxAllowed int) error {
	if len(pos) > maxAllowed {
		return fmt.Errorf("%s: unexpected positional argument(s): %s", model.ErrValidation, strings.Join(pos[maxAllowed:], " "))
	}
	return nil
}

func (c *cliContext) handleMock(args []string, stdout io.Writer) (bool, int, model.Result) {
	if len(args) == 0 {
		return false, 0, model.NewError(model.ErrValidation, "missing mock verb (expected: status|config|start|serve|stop|route)")
	}
	verb := strings.ToLower(strings.TrimSpace(args[0]))
	rest := args[1:]

	coll, collRoot, err := c.resolveTargetCollection("")
	if err != nil {
		return false, 0, resultFromError(err)
	}

	switch verb {
	case "status":
		fset := flag.NewFlagSet("mock status", flag.ContinueOnError)
		pos, err := parseSubcommandFlags(fset, rest)
		if err != nil {
			return false, 0, model.NewError(model.ErrValidation, err.Error())
		}
		if err := rejectUnexpectedPositionals(pos, 0); err != nil {
			return false, 0, resultFromError(err)
		}
		st, err := c.buildMockStatus(coll, collRoot)
		if err != nil {
			return false, 0, resultFromError(err)
		}
		return false, 0, model.NewSuccess(st)

	case "config":
		return false, 0, c.handleMockConfig(coll, collRoot, rest)

	case "start", "serve":
		return c.handleMockStart(coll, collRoot, rest, stdout)

	case "stop":
		return false, 0, c.handleMockStop(coll, collRoot, rest)

	case "route", "routes":
		return false, 0, c.handleMockRoute(collRoot, rest)

	default:
		return false, 0, model.NewError(model.ErrValidation, fmt.Sprintf("unknown mock verb %q (expected: status|config|start|serve|stop|route)", verb))
	}
}

func (c *cliContext) handleMockConfig(coll model.Collection, collRoot string, rest []string) model.Result {
	fset := flag.NewFlagSet("mock config", flag.ContinueOnError)
	var port int
	fset.IntVar(&port, "port", 0, "Mock server port (1024..65535)")
	fset.IntVar(&port, "p", 0, "Mock server port alias (1024..65535)")

	pos, err := parseSubcommandFlags(fset, rest)
	if err != nil {
		return model.NewError(model.ErrValidation, err.Error())
	}
	if err := rejectUnexpectedPositionals(pos, 0); err != nil {
		return resultFromError(err)
	}
	visited := visitedFlagsMap(fset)
	hasPortFlag := visited["port"] || visited["p"]
	if !hasPortFlag {
		st, err := c.buildMockStatus(coll, collRoot)
		if err != nil {
			return resultFromError(err)
		}
		return model.NewSuccess(st)
	}

	if err := validateMockPort(port); err != nil {
		return resultFromError(err)
	}

	curRes := c.mockSvc.GetStatus(collRoot)
	if !curRes.Success {
		return curRes
	}
	curStatus := curRes.Data.(model.MockServerStatus)
	saveRes := c.mockSvc.SaveConfig(collRoot, model.MockServerConfig{
		Port:   port,
		Routes: curStatus.Routes,
	})
	if !saveRes.Success {
		return saveRes
	}
	st, err := c.buildMockStatus(coll, collRoot)
	if err != nil {
		return resultFromError(err)
	}
	return model.NewSuccess(st)
}

func (c *cliContext) handleMockStart(coll model.Collection, collRoot string, rest []string, stdout io.Writer) (bool, int, model.Result) {
	fset := flag.NewFlagSet("mock start", flag.ContinueOnError)
	var port int
	var daemon bool
	fset.IntVar(&port, "port", 0, "Mock server port (1024..65535)")
	fset.IntVar(&port, "p", 0, "Mock server port alias (1024..65535)")
	fset.BoolVar(&daemon, "daemon", false, "Run mock server as a background daemon")

	pos, err := parseSubcommandFlags(fset, rest)
	if err != nil {
		return false, 0, model.NewError(model.ErrValidation, err.Error())
	}
	if err := rejectUnexpectedPositionals(pos, 0); err != nil {
		return false, 0, resultFromError(err)
	}
	visited := visitedFlagsMap(fset)
	hasPortFlag := visited["port"] || visited["p"]

	if hasPortFlag {
		if err := validateMockPort(port); err != nil {
			return false, 0, resultFromError(err)
		}
	} else {
		curRes := c.mockSvc.GetStatus(collRoot)
		if !curRes.Success {
			return false, 0, curRes
		}
		curStatus := curRes.Data.(model.MockServerStatus)
		if err := validateMockPort(curStatus.Port); err != nil {
			return false, 0, resultFromError(err)
		}
		port = curStatus.Port
	}

	if daemon {
		if _, err := c.stopExistingMockDaemon(); err != nil {
			return false, 0, resultFromError(err)
		}
		return false, 0, c.startMockDaemonChild(coll, hasPortFlag, port)
	}

	return c.runMockForeground(coll, collRoot, hasPortFlag, port, stdout)
}

func (c *cliContext) cleanupFailedDaemonChild(cmd *exec.Cmd) {
	var pid int
	if cmd != nil && cmd.Process != nil {
		pid = cmd.Process.Pid
		_ = cmd.Process.Kill()
	}
	if cmd != nil {
		_ = cmd.Wait()
	}
	if pid > 0 {
		if daemonPath, err := c.mockDaemonPath(); err == nil {
			removeMockDaemonFileIfOwned(daemonPath, pid)
		}
	}
	_, _ = c.stopExistingMockDaemon()
}

func (c *cliContext) startMockDaemonChild(coll model.Collection, hasPortFlag bool, targetPort int) model.Result {
	exePath, err := os.Executable()
	if err != nil {
		return model.NewError(model.ErrIO, fmt.Sprintf("failed to locate executable: %v", err))
	}

	rPipe, wPipe, err := os.Pipe()
	if err != nil {
		return model.NewError(model.ErrIO, fmt.Sprintf("failed to create daemon pipe: %v", err))
	}

	devNull, err := os.OpenFile(os.DevNull, os.O_RDWR, 0)
	if err != nil {
		_ = rPipe.Close()
		_ = wPipe.Close()
		return model.NewError(model.ErrIO, fmt.Sprintf("failed to open %s: %v", os.DevNull, err))
	}
	defer devNull.Close()

	var childArgs []string
	if strings.TrimSpace(c.dataDir) != "" {
		childArgs = append(childArgs, "--data-dir", c.dataDir)
	}
	childArgs = append(childArgs, "-c", coll.ID, "mock", "start")
	if hasPortFlag {
		childArgs = append(childArgs, "--port", strconv.Itoa(targetPort))
	}

	baseEnv := make([]string, 0, len(os.Environ())+2)
	for _, entry := range os.Environ() {
		if strings.HasPrefix(entry, mockInternalDaemonEnv+"=") || strings.HasPrefix(entry, mockDaemonHandshakeFDEnv+"=") {
			continue
		}
		baseEnv = append(baseEnv, entry)
	}
	baseEnv = append(baseEnv, mockInternalDaemonEnv+"=1", mockDaemonHandshakeFDEnv+"=3")

	cmd := exec.Command(exePath, childArgs...)
	cmd.Stdin = devNull
	cmd.Stdout = devNull
	cmd.Stderr = devNull
	cmd.ExtraFiles = []*os.File{wPipe}
	cmd.Env = baseEnv
	cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true}

	if err := cmd.Start(); err != nil {
		_ = rPipe.Close()
		_ = wPipe.Close()
		return model.NewError(model.ErrIO, fmt.Sprintf("failed to spawn mock daemon: %v", err))
	}
	// Parent must close the write end immediately so EOF triggers if child exits early.
	_ = wPipe.Close()

	hs, err := readDaemonHandshake(rPipe, 10*time.Second)
	if err != nil {
		c.cleanupFailedDaemonChild(cmd)
		return resultFromError(err)
	}
	if !hs.Success {
		_ = cmd.Wait()
		if hs.Error != nil {
			return model.Result{Success: false, Error: hs.Error}
		}
		return model.NewError(model.ErrIO, "mock daemon failed to start")
	}
	if hs.Status == nil {
		c.cleanupFailedDaemonChild(cmd)
		return model.NewError(model.ErrIO, "mock daemon returned empty status")
	}
	if err := waitTCPReady(hs.Status.Port, 2*time.Second); err != nil {
		c.cleanupFailedDaemonChild(cmd)
		return resultFromError(err)
	}

	// Reap child asynchronously if stopped while parent stays alive (e.g. inside `go test`).
	go func() {
		_ = cmd.Wait()
	}()

	return model.NewSuccess(hs.Status)
}

func (c *cliContext) runMockForeground(coll model.Collection, collRoot string, hasPortFlag bool, targetPort int, stdout io.Writer) (bool, int, model.Result) {
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	defer signal.Stop(sigCh)

	handshakeFile, isChild := handshakeFileFromEnv()
	failStart := func(res model.Result) (bool, int, model.Result) {
		if isChild {
			errObj := res.Error
			if errObj == nil {
				errObj = &model.AppError{Code: model.ErrIO, Message: "mock server failed to start"}
			}
			_ = json.NewEncoder(handshakeFile).Encode(mockDaemonHandshake{Success: false, Error: errObj})
			_ = handshakeFile.Close()
			return true, 1, model.Result{}
		}
		return false, 0, res
	}

	if _, err := c.stopExistingMockDaemon(); err != nil {
		return failStart(resultFromError(err))
	}

	daemonPath, err := c.mockDaemonPath()
	if err != nil {
		return failStart(resultFromError(err))
	}

	startPortArg := -1
	if hasPortFlag {
		startPortArg = targetPort
	}
	startRes := c.mockSvc.Start(collRoot, startPortArg)
	if !startRes.Success {
		return failStart(startRes)
	}
	svcStatus := startRes.Data.(model.MockServerStatus)
	routes := svcStatus.Routes
	if routes == nil {
		routes = []model.MockRoute{}
	}

	stopWatcher, err := startMockConfigWatcher(collRoot, func() {
		c.mockSvc.ReloadRoutes(collRoot)
	})
	if err != nil {
		c.mockSvc.Stop(collRoot)
		return failStart(model.NewError(model.ErrIO, fmt.Sprintf("failed to watch mock-server.json: %v", err)))
	}

	if err := waitTCPReady(svcStatus.Port, 2*time.Second); err != nil {
		stopWatcher()
		c.mockSvc.Stop(collRoot)
		return failStart(resultFromError(err))
	}

	select {
	case <-sigCh:
		stopWatcher()
		c.mockSvc.Stop(collRoot)
		return failStart(model.NewError(model.ErrAborted, "mock server interrupted during startup"))
	default:
	}

	absCollRoot := normalizeAbsPath(collRoot)
	now := time.Now()
	daemonState := mockDaemonState{
		PID:          os.Getpid(),
		Port:         svcStatus.Port,
		BaseURL:      svcStatus.BaseURL,
		CollectionID: coll.ID,
		CollRoot:     absCollRoot,
		StartedAt:    now,
	}
	if err := c.fs.WriteJSON(daemonPath, daemonState); err != nil {
		stopWatcher()
		c.mockSvc.Stop(collRoot)
		return failStart(model.NewError(model.ErrIO, fmt.Sprintf("failed to write %s: %v", daemonPath, err)))
	}

	statusOut := mockStatusOutput{
		Running:      true,
		Port:         svcStatus.Port,
		BaseURL:      svcStatus.BaseURL,
		Routes:       routes,
		PID:          daemonState.PID,
		CollectionID: coll.ID,
		CollRoot:     absCollRoot,
		StartedAt:    &now,
	}

	if isChild {
		writeDaemonHandshakeSuccess(handshakeFile, statusOut)
	} else if c.jsonOutput {
		enc := json.NewEncoder(stdout)
		enc.SetEscapeHTML(false)
		_ = enc.Encode(model.NewSuccess(statusOut))
	} else {
		_, _ = fmt.Fprintf(stdout, "Mock server listening at %s (collection: %s, pid: %d)\n", statusOut.BaseURL, coll.ID, daemonState.PID)
	}

	<-sigCh

	stopWatcher()
	c.mockSvc.Stop(collRoot)
	removeMockDaemonFileIfOwned(daemonPath, os.Getpid())
	return true, 0, model.Result{}
}

func (c *cliContext) handleMockStop(coll model.Collection, collRoot string, rest []string) model.Result {
	fset := flag.NewFlagSet("mock stop", flag.ContinueOnError)
	pos, err := parseSubcommandFlags(fset, rest)
	if err != nil {
		return model.NewError(model.ErrValidation, err.Error())
	}
	if err := rejectUnexpectedPositionals(pos, 0); err != nil {
		return resultFromError(err)
	}

	wasRunning, err := c.stopExistingMockDaemon()
	if err != nil {
		return resultFromError(err)
	}
	c.mockSvc.Stop(collRoot)

	st, err := c.buildMockStatus(coll, collRoot)
	if err != nil {
		return resultFromError(err)
	}
	st.Stopped = &wasRunning
	return model.NewSuccess(st)
}

func (c *cliContext) handleMockRoute(collRoot string, args []string) model.Result {
	if len(args) == 0 {
		return model.NewError(model.ErrValidation, "missing mock route verb (expected: list|get|create|update|delete)")
	}
	verb := strings.ToLower(strings.TrimSpace(args[0]))
	rest := args[1:]

	switch verb {
	case "list", "ls":
		fset := flag.NewFlagSet("mock route list", flag.ContinueOnError)
		pos, err := parseSubcommandFlags(fset, rest)
		if err != nil {
			return model.NewError(model.ErrValidation, err.Error())
		}
		if err := rejectUnexpectedPositionals(pos, 0); err != nil {
			return resultFromError(err)
		}
		stRes := c.mockSvc.GetStatus(collRoot)
		if !stRes.Success {
			return stRes
		}
		routes := stRes.Data.(model.MockServerStatus).Routes
		if routes == nil {
			routes = []model.MockRoute{}
		}
		return model.NewSuccess(routes)

	case "get", "show":
		fset := flag.NewFlagSet("mock route get", flag.ContinueOnError)
		pos, err := parseSubcommandFlags(fset, rest)
		if err != nil {
			return model.NewError(model.ErrValidation, err.Error())
		}
		if len(pos) == 0 {
			return model.NewError(model.ErrValidation, "route selector <id|\"METHOD /path\"> is required")
		}
		if err := rejectUnexpectedPositionals(pos, 1); err != nil {
			return resultFromError(err)
		}
		stRes := c.mockSvc.GetStatus(collRoot)
		if !stRes.Success {
			return stRes
		}
		routes := stRes.Data.(model.MockServerStatus).Routes
		_, rt, err := resolveMockRouteSelector(routes, pos[0])
		if err != nil {
			return resultFromError(err)
		}
		return model.NewSuccess(rt)

	case "create", "add":
		return c.handleMockRouteCreate(collRoot, rest)

	case "update", "patch":
		return c.handleMockRouteUpdate(collRoot, rest)

	case "delete", "rm":
		fset := flag.NewFlagSet("mock route delete", flag.ContinueOnError)
		pos, err := parseSubcommandFlags(fset, rest)
		if err != nil {
			return model.NewError(model.ErrValidation, err.Error())
		}
		if len(pos) == 0 {
			return model.NewError(model.ErrValidation, "route selector <id|\"METHOD /path\"> is required")
		}
		if err := rejectUnexpectedPositionals(pos, 1); err != nil {
			return resultFromError(err)
		}
		stRes := c.mockSvc.GetStatus(collRoot)
		if !stRes.Success {
			return stRes
		}
		st := stRes.Data.(model.MockServerStatus)
		idx, rt, err := resolveMockRouteSelector(st.Routes, pos[0])
		if err != nil {
			return resultFromError(err)
		}
		newRoutes := make([]model.MockRoute, 0, len(st.Routes)-1)
		newRoutes = append(newRoutes, st.Routes[:idx]...)
		newRoutes = append(newRoutes, st.Routes[idx+1:]...)

		saveRes := c.mockSvc.SaveConfig(collRoot, model.MockServerConfig{
			Port:   st.Port,
			Routes: newRoutes,
		})
		if !saveRes.Success {
			return saveRes
		}
		return model.NewSuccess(map[string]interface{}{
			"deleted_id": rt.ID,
			"method":     rt.Method,
			"path":       rt.Path,
		})

	default:
		return model.NewError(model.ErrValidation, fmt.Sprintf("unknown mock route verb %q (expected: list|get|create|update|delete)", verb))
	}
}

func (c *cliContext) handleMockRouteCreate(collRoot string, rest []string) model.Result {
	fset := flag.NewFlagSet("mock route create", flag.ContinueOnError)
	var method, path, bodyRaw, desc string
	var statusCode int
	var delayMs int64
	var headers multiStringFlag
	var enabledFlag, disabledFlag bool

	fset.StringVar(&method, "method", "GET", "HTTP method (GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD|ANY)")
	fset.StringVar(&path, "path", "", "Route path (e.g. /api/users/:id)")
	fset.IntVar(&statusCode, "status-code", 200, "HTTP status code (100..599)")
	fset.IntVar(&statusCode, "status", 200, "HTTP status code alias (100..599)")
	fset.Int64Var(&delayMs, "delay-ms", 0, "Response delay in ms (0..30000)")
	fset.Int64Var(&delayMs, "delay", 0, "Response delay alias in ms (0..30000)")
	fset.Var(&headers, "header", "Response header 'K: V'")
	fset.StringVar(&bodyRaw, "body", "", "Response body string or @filepath")
	fset.StringVar(&desc, "description", "", "Route description")
	fset.StringVar(&desc, "desc", "", "Route description alias")
	fset.BoolVar(&enabledFlag, "enabled", true, "Enable this route")
	fset.BoolVar(&disabledFlag, "disabled", false, "Create this route disabled")

	pos, err := parseSubcommandFlags(fset, rest)
	if err != nil {
		return model.NewError(model.ErrValidation, err.Error())
	}
	if err := rejectUnexpectedPositionals(pos, 0); err != nil {
		return resultFromError(err)
	}
	visited := visitedFlagsMap(fset)

	if visited["enabled"] && visited["disabled"] {
		return model.NewError(model.ErrValidation, "cannot specify both --enabled and --disabled")
	}
	if strings.TrimSpace(path) == "" {
		return model.NewError(model.ErrValidation, "--path is required for `mock route create`")
	}
	if visited["method"] && strings.TrimSpace(method) == "" {
		return model.NewError(model.ErrValidation, "--method cannot be empty")
	}
	normMethod, err := normalizeMockMethod(method)
	if err != nil {
		return resultFromError(err)
	}

	if err := validateMockStatusCode(statusCode); err != nil {
		return resultFromError(err)
	}
	if err := validateMockDelayMs(delayMs); err != nil {
		return resultFromError(err)
	}

	bodyContent, err := readStringOrFileFlag(bodyRaw)
	if err != nil {
		return resultFromError(err)
	}

	parsedHeaders := []model.KVPair{}
	for _, hRaw := range headers {
		k, v, err := parseHeaderFlag(hRaw)
		if err != nil {
			return resultFromError(err)
		}
		parsedHeaders = upsertHeaderKVPair(parsedHeaders, k, v)
	}

	routeEnabled := true
	if visited["enabled"] {
		routeEnabled = enabledFlag
	} else if visited["disabled"] {
		routeEnabled = !disabledFlag
	}

	newRoute := model.MockRoute{
		ID:          uuid.New().String(),
		Method:      normMethod,
		Path:        service.CleanMockPath(path),
		StatusCode:  statusCode,
		Headers:     parsedHeaders,
		Body:        bodyContent,
		DelayMs:     delayMs,
		Enabled:     routeEnabled,
		Description: desc,
	}

	stRes := c.mockSvc.GetStatus(collRoot)
	if !stRes.Success {
		return stRes
	}
	st := stRes.Data.(model.MockServerStatus)
	updatedRoutes := append([]model.MockRoute{}, st.Routes...)
	updatedRoutes = append(updatedRoutes, newRoute)

	saveRes := c.mockSvc.SaveConfig(collRoot, model.MockServerConfig{
		Port:   st.Port,
		Routes: updatedRoutes,
	})
	if !saveRes.Success {
		return saveRes
	}
	savedRoutes := saveRes.Data.(model.MockServerStatus).Routes
	return model.NewSuccess(savedRoutes[len(savedRoutes)-1])
}

func (c *cliContext) handleMockRouteUpdate(collRoot string, rest []string) model.Result {
	fset := flag.NewFlagSet("mock route update", flag.ContinueOnError)
	var method, path, bodyRaw, desc string
	var statusCode int
	var delayMs int64
	var setHeaders, unsetHeaders multiStringFlag
	var enabledFlag, disabledFlag bool

	fset.StringVar(&method, "method", "", "HTTP method (GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD|ANY)")
	fset.StringVar(&path, "path", "", "Route path")
	fset.IntVar(&statusCode, "status-code", 0, "HTTP status code (100..599)")
	fset.IntVar(&statusCode, "status", 0, "HTTP status code alias (100..599)")
	fset.Int64Var(&delayMs, "delay-ms", 0, "Response delay in ms (0..30000)")
	fset.Int64Var(&delayMs, "delay", 0, "Response delay alias in ms (0..30000)")
	fset.Var(&setHeaders, "set-header", "Set response header 'K: V'")
	fset.Var(&unsetHeaders, "unset-header", "Unset response header K")
	fset.StringVar(&bodyRaw, "body", "", "Response body string or @filepath")
	fset.StringVar(&desc, "description", "", "Route description")
	fset.StringVar(&desc, "desc", "", "Route description alias")
	fset.BoolVar(&enabledFlag, "enabled", true, "Enable this route")
	fset.BoolVar(&disabledFlag, "disabled", false, "Disable this route")

	pos, err := parseSubcommandFlags(fset, rest)
	if err != nil {
		return model.NewError(model.ErrValidation, err.Error())
	}
	if len(pos) == 0 {
		return model.NewError(model.ErrValidation, "route selector <id|\"METHOD /path\"> is required for `mock route update`")
	}
	if err := rejectUnexpectedPositionals(pos, 1); err != nil {
		return resultFromError(err)
	}

	visited := visitedFlagsMap(fset)
	hasUpdateFlag := visited["method"] || visited["path"] ||
		visited["status-code"] || visited["status"] ||
		visited["delay-ms"] || visited["delay"] ||
		len(setHeaders) > 0 || len(unsetHeaders) > 0 ||
		visited["body"] || visited["description"] || visited["desc"] ||
		visited["enabled"] || visited["disabled"]
	if !hasUpdateFlag {
		return model.NewError(model.ErrValidation, "at least one update flag is required for `mock route update`")
	}
	if visited["enabled"] && visited["disabled"] {
		return model.NewError(model.ErrValidation, "cannot specify both --enabled and --disabled")
	}

	stRes := c.mockSvc.GetStatus(collRoot)
	if !stRes.Success {
		return stRes
	}
	st := stRes.Data.(model.MockServerStatus)
	idx, rt, err := resolveMockRouteSelector(st.Routes, pos[0])
	if err != nil {
		return resultFromError(err)
	}

	if visited["method"] {
		if strings.TrimSpace(method) == "" {
			return model.NewError(model.ErrValidation, "method cannot be empty")
		}
		normMethod, err := normalizeMockMethod(method)
		if err != nil {
			return resultFromError(err)
		}
		rt.Method = normMethod
	}
	if visited["path"] {
		if strings.TrimSpace(path) == "" {
			return model.NewError(model.ErrValidation, "path cannot be empty")
		}
		rt.Path = service.CleanMockPath(path)
	}
	if visited["status-code"] || visited["status"] {
		if err := validateMockStatusCode(statusCode); err != nil {
			return resultFromError(err)
		}
		rt.StatusCode = statusCode
	}
	if visited["delay-ms"] || visited["delay"] {
		if err := validateMockDelayMs(delayMs); err != nil {
			return resultFromError(err)
		}
		rt.DelayMs = delayMs
	}
	for _, hRaw := range setHeaders {
		k, v, err := parseHeaderFlag(hRaw)
		if err != nil {
			return resultFromError(err)
		}
		rt.Headers = upsertHeaderKVPair(rt.Headers, k, v)
	}
	for _, rawKey := range unsetHeaders {
		k := strings.TrimSpace(rawKey)
		if k == "" {
			return model.NewError(model.ErrValidation, "--unset-header key cannot be empty")
		}
		rt.Headers = removeHeaderKVPair(rt.Headers, k)
	}
	if visited["body"] {
		content, err := readStringOrFileFlag(bodyRaw)
		if err != nil {
			return resultFromError(err)
		}
		rt.Body = content
	}
	if visited["description"] || visited["desc"] {
		rt.Description = desc
	}
	if visited["enabled"] {
		rt.Enabled = enabledFlag
	} else if visited["disabled"] {
		rt.Enabled = !disabledFlag
	}

	updatedRoutes := append([]model.MockRoute{}, st.Routes...)
	updatedRoutes[idx] = rt

	saveRes := c.mockSvc.SaveConfig(collRoot, model.MockServerConfig{
		Port:   st.Port,
		Routes: updatedRoutes,
	})
	if !saveRes.Success {
		return saveRes
	}
	savedRoutes := saveRes.Data.(model.MockServerStatus).Routes
	return model.NewSuccess(savedRoutes[idx])
}
