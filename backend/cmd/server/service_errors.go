package main

import (
	"errors"
	"log"
	"net/http"
)

// serviceError is how a service (the *_service.go files) reports a failure the
// client should see. It carries the status and the exact text the handler
// answers with — the same text the handler wrote itself before the logic moved
// out of it, so the move changed no response. The cause, when there is one, is
// logged and never sent.
type serviceError struct {
	status int
	msg    string
	cause  error
}

func (e *serviceError) Error() string {
	if e.cause != nil {
		return e.msg + ": " + e.cause.Error()
	}
	return e.msg
}

func (e *serviceError) Unwrap() error { return e.cause }

func invalid(msg string) error { return &serviceError{status: http.StatusBadRequest, msg: msg} }

// invalidFrom is a 400 caused by a database error. Several handlers answered a
// failed write with 400 rather than 500; that is kept until the API's error
// contract is revisited (refactor step 4).
func invalidFrom(msg string, cause error) error {
	return &serviceError{status: http.StatusBadRequest, msg: msg, cause: cause}
}

func unauthorizedFrom(msg string, cause error) error {
	return &serviceError{status: http.StatusUnauthorized, msg: msg, cause: cause}
}

func notFound(msg string) error { return &serviceError{status: http.StatusNotFound, msg: msg} }

func notFoundFrom(msg string, cause error) error {
	return &serviceError{status: http.StatusNotFound, msg: msg, cause: cause}
}

func conflict(msg string) error { return &serviceError{status: http.StatusConflict, msg: msg} }

func internal(msg string, cause error) error {
	return &serviceError{status: http.StatusInternalServerError, msg: msg, cause: cause}
}

// writeServiceError answers with a service's error. Anything that is not a
// serviceError is a bug in the service; it is logged and becomes a bare 500,
// so an unexpected error's text never reaches the client.
func writeServiceError(w http.ResponseWriter, err error) {
	var se *serviceError
	if !errors.As(err, &se) {
		log.Println(err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	if se.cause != nil {
		log.Println(se.cause)
	}
	http.Error(w, se.msg, se.status)
}
