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

const (
	ErrCollectionRootEmpty      = "Đường dẫn collection trống"
	ErrCollectionNameEmpty      = "Tên collection không được để trống"
	ErrCollectionNotFound       = "Không tìm thấy collection"
	ErrCannotDeleteDefaultColl  = "Không thể xóa collection mặc định"
	ErrCollectionIDEmpty        = "Collection ID không được để trống"
	ErrCollectionCreateFailed   = "Không thể tạo collection"
	ErrCollectionRenameFailed   = "Không thể lưu tên collection mới"
	ErrCollectionUpdateFailed   = "Không thể cập nhật thông tin collection"
	ErrCollectionDeleteFailed   = "Không thể xóa collection"
	ErrCollectionDuplicateFailed = "Không thể nhân bản collection"
	ErrInvalidLocale            = "Ngôn ngữ không hợp lệ: chỉ chấp nhận 'en' hoặc 'vi'"
	ErrParentFolderNotFound     = "Không tìm thấy thư mục cha"
	ErrParentFolderInvalid     = "Thư mục cha không hợp lệ"
	ErrFolderCreateFailed      = "Không thể tạo thư mục"
	ErrFolderInfoSaveFailed    = "Không thể lưu thông tin thư mục"
	ErrRequestSaveFailed       = "Không thể lưu request"
	ErrFolderNameEmpty         = "Tên thư mục không được để trống"
	ErrFolderNotFound          = "Không tìm thấy thư mục"
	ErrFolderReadFailed        = "Không thể đọc dữ liệu thư mục"
	ErrFolderRenameFailed      = "Không thể lưu tên thư mục mới"
	ErrRootPathAndIDRequired   = "rootPath và id là bắt buộc"
	ErrInvalidFolderPath       = "Đường dẫn không phải là thư mục hợp lệ"
	ErrFolderDeleteFailed      = "Không thể xóa thư mục"
	ErrFolderNotInRoot         = "Thư mục không nằm trong collection root"
	ErrFolderMoveCycle         = "Không thể di chuyển thư mục vào chính nó hoặc thư mục con của nó"
	ErrMoveFolderToEnvFailed   = "Không thể chuyển thư mục vào thư mục environments"
	ErrFolderMoveConflict      = "Thư mục cùng tên đã tồn tại tại vị trí đích"
	ErrFolderMoveFailed        = "Không thể di chuyển thư mục"
	ErrIDInvalid               = "ID không hợp lệ"
	ErrRequestNotFound         = "Request không tìm thấy"
	ErrRequestFileInvalid      = "ID không trỏ tới một file request hợp lệ"
	ErrRequestNotInRoot        = "Request không nằm trong collection root"
	ErrTargetFolderNotFound    = "Thư mục đích không tìm thấy"
	ErrTargetFolderInvalid     = "Thư mục đích không hợp lệ"
	ErrTargetFolderNotInRoot   = "Thư mục đích không nằm trong collection root"
	ErrMoveToEnvFolderFailed   = "Không thể chuyển request vào thư mục environments"
	ErrRequestMoveFailed       = "Không thể di chuyển request"
	ErrRequestNameEmpty        = "Tên request không được để trống"
	ErrRequestReadFailed       = "Không thể đọc dữ liệu request"
	ErrRequestRenameFailed     = "Không thể lưu tên request mới"
	ErrRequestDeleteFailed     = "Không thể xóa request"
	ErrRequestDuplicateFailed  = "Không thể lưu request bản sao"
	ErrMethodInvalid           = "Phương thức không hợp lệ"
	ErrURLEmpty                = "URL không được để trống"
	ErrURLInvalid              = "URL không hợp lệ hoặc thiếu scheme (http/https)"
	ErrRequestCreateFailed     = "Không thể tạo request: %v"
	ErrAborted                 = "Đã hủy"
	ErrTimeout                 = "Quá thời gian chờ (timeout)"
	ErrTimeoutBody             = "Quá thời gian chờ (timeout) khi đọc body"
	ErrCertInvalid             = "Lỗi chứng chỉ SSL: %v"
	ErrConnectionFailed        = "Lỗi kết nối: %v"
	ErrBodyReadFailed          = "Lỗi khi đọc body: %v"
	ErrFileReadFailed          = "Không thể đọc file: %v"
	ErrJSONInvalid             = "File JSON không hợp lệ: %v"
	ErrPostmanVersionInvalid   = "Chỉ hỗ trợ Postman Collection v2.1.0"
	ErrConfigResolvePathFailed = "Không thể xác định thư mục config: %s"
	ErrConfigInitFailed        = "Không thể khởi tạo config: %s"
	ErrFlowNotFound            = "Không tìm thấy flow"
	ErrFlowNameEmpty           = "Tên flow không được để trống"
	ErrFlowReadFailed          = "Không thể đọc dữ liệu flow"
	ErrFlowSaveFailed          = "Không thể lưu flow"
	ErrFlowRenameFailed        = "Không thể lưu tên flow mới"
	ErrFlowDeleteFailed        = "Không thể xóa flow"
	ErrFlowDuplicateFailed     = "Không thể nhân bản flow"
	ErrFlowMoveFailed          = "Không thể di chuyển flow"
	ErrFlowFileInvalid         = "ID không trỏ tới một file flow hợp lệ"
	ErrFlowNotInRoot           = "Flow không nằm trong thư mục flows của collection"
	ErrFlowLayoutInvalid       = "Bố cục flow không hợp lệ (chỉ hỗ trợ vertical hoặc horizontal)"
	ErrFlowFolderNotFound      = "Không tìm thấy thư mục flow"
	ErrFlowFolderNameEmpty     = "Tên thư mục flow không được để trống"
	ErrFlowFolderCreateFailed  = "Không thể tạo thư mục flow"
	ErrFlowFolderReadFailed    = "Không thể đọc dữ liệu thư mục flow"
	ErrFlowFolderSaveFailed    = "Không thể lưu thông tin thư mục flow"
	ErrFlowFolderRenameFailed  = "Không thể lưu tên thư mục flow mới"
	ErrFlowFolderDeleteFailed  = "Không thể xóa thư mục flow"
	ErrFlowFolderMoveFailed    = "Không thể di chuyển thư mục flow"
	ErrFlowFolderMoveCycle     = "Không thể di chuyển thư mục flow vào chính nó hoặc thư mục con của nó"
	ErrFlowFolderInvalid       = "Đường dẫn không phải là thư mục flow hợp lệ"
)
