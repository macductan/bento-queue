package main

import (
	"fmt"
	"os"
)

func main() {
	os.Setenv("XDG_CONFIG_HOME", "/tmp/mock-config")
	dir, _ := os.UserConfigDir()
	fmt.Println(dir)
}
