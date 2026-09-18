package service

import (
	"strings"

	"hecto-api/model"
)

// storageErrCode maps storage errors (from storage.FileSystem) to model.ErrCode constants.
// If the error message starts with model.ErrNotFound or model.ErrParse, we return that code.
// Otherwise, it's considered an IO error.
func storageErrCode(err error) string {
	if err == nil {
		return ""
	}
	msg := err.Error()
	if strings.HasPrefix(msg, model.ErrNotFound) {
		return model.ErrNotFound
	}
	if strings.HasPrefix(msg, model.ErrParse) {
		return model.ErrParse
	}
	if strings.HasPrefix(msg, model.ErrValidation) {
		return model.ErrValidation
	}
	return model.ErrIO
}
