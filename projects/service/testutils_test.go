package service_test

import (
	"time"
	"hecto-api/model"
)

func createTestRequest(id, name, method string) model.Request {
	return model.Request{ID: id, Name: name, Method: method, CreatedAt: time.Now()}
}
