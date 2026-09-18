package slug

import (
	"os"
	"path/filepath"
	"testing"
)

func TestGenerate_VietnameseDiacritics(t *testing.T) {
	got := Generate("Đăng nhập")
	want := "dang-nhap.json"
	if got != want {
		t.Errorf("Generate(%q) = %q, want %q", "Đăng nhập", got, want)
	}
}

func TestGenerate_EnglishNormal(t *testing.T) {
	got := Generate("Get All Users")
	want := "get-all-users.json"
	if got != want {
		t.Errorf("Generate(%q) = %q, want %q", "Get All Users", got, want)
	}
}

func TestGenerate_SpecialChars(t *testing.T) {
	got := Generate("Test @#$ API!")
	want := "test-api.json"
	if got != want {
		t.Errorf("Generate(%q) = %q, want %q", "Test @#$ API!", got, want)
	}
}

func TestGenerate_MultipleSpacesHyphens(t *testing.T) {
	got := Generate("hello   --  world")
	want := "hello-world.json"
	if got != want {
		t.Errorf("Generate(%q) = %q, want %q", "hello   --  world", got, want)
	}
}

func TestGenerate_EmptyString(t *testing.T) {
	got := Generate("")
	want := "untitled.json"
	if got != want {
		t.Errorf("Generate(%q) = %q, want %q", "", got, want)
	}
}

func TestGenerate_WhitespaceOnly(t *testing.T) {
	got := Generate("   ")
	want := "untitled.json"
	if got != want {
		t.Errorf("Generate(%q) = %q, want %q", "   ", got, want)
	}
}

func TestGenerate_AllSpecialChars(t *testing.T) {
	got := Generate("@#$%^&*()")
	want := "untitled.json"
	if got != want {
		t.Errorf("Generate(%q) = %q, want %q", "@#$%^&*()", got, want)
	}
}

func TestGenerate_VietnameseComplex(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"Lấy thông tin user", "lay-thong-tin-user.json"},
		{"Tạo sản phẩm mới", "tao-san-pham-moi.json"},
		{"Đổi mật khẩu", "doi-mat-khau.json"},
		{"Xóa tất cả", "xoa-tat-ca.json"},
	}

	for _, tt := range tests {
		got := Generate(tt.input)
		if got != tt.want {
			t.Errorf("Generate(%q) = %q, want %q", tt.input, got, tt.want)
		}
	}
}

func TestGenerate_Underscores(t *testing.T) {
	got := Generate("hello_world_test")
	want := "hello-world-test.json"
	if got != want {
		t.Errorf("Generate(%q) = %q, want %q", "hello_world_test", got, want)
	}
}

func TestGenerate_LeadingTrailingHyphens(t *testing.T) {
	got := Generate("--hello--")
	want := "hello.json"
	if got != want {
		t.Errorf("Generate(%q) = %q, want %q", "--hello--", got, want)
	}
}

func TestGenerateUnique_NoCollision(t *testing.T) {
	dir := t.TempDir()

	got := GenerateUnique("Đăng nhập", dir)
	want := "dang-nhap.json"
	if got != want {
		t.Errorf("GenerateUnique no collision = %q, want %q", got, want)
	}
}

func TestGenerateUnique_FirstCollision(t *testing.T) {
	dir := t.TempDir()

	// Create existing file
	existing := filepath.Join(dir, "dang-nhap.json")
	if err := os.WriteFile(existing, []byte("{}"), 0644); err != nil {
		t.Fatalf("failed to create test file: %v", err)
	}

	got := GenerateUnique("Đăng nhập", dir)
	want := "dang-nhap-1.json"
	if got != want {
		t.Errorf("GenerateUnique first collision = %q, want %q", got, want)
	}
}

func TestGenerateUnique_SecondCollision(t *testing.T) {
	dir := t.TempDir()

	// Create two existing files
	for _, name := range []string{"dang-nhap.json", "dang-nhap-1.json"} {
		path := filepath.Join(dir, name)
		if err := os.WriteFile(path, []byte("{}"), 0644); err != nil {
			t.Fatalf("failed to create test file %s: %v", name, err)
		}
	}

	got := GenerateUnique("Đăng nhập", dir)
	want := "dang-nhap-2.json"
	if got != want {
		t.Errorf("GenerateUnique second collision = %q, want %q", got, want)
	}
}

func TestUniqueFilename_NoCollision(t *testing.T) {
	dir := t.TempDir()
	got := UniqueFilename("test.json", dir)
	if got != "test.json" {
		t.Errorf("UniqueFilename no collision = %q, want %q", got, "test.json")
	}
}

func TestUniqueFilename_Collision(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "test.json"), []byte("{}"), 0644); err != nil {
		t.Fatalf("failed to create test file: %v", err)
	}
	if err := os.WriteFile(filepath.Join(dir, "test-1.json"), []byte("{}"), 0644); err != nil {
		t.Fatalf("failed to create test file: %v", err)
	}

	got := UniqueFilename("test.json", dir)
	if got != "test-2.json" {
		t.Errorf("UniqueFilename collision = %q, want %q", got, "test-2.json")
	}
}
