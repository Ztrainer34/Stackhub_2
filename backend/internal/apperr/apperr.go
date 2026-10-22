// Package apperr is how a service reports a failure the client should see,
// without knowing anything about HTTP. httpx.WriteError turns it into a
// response: the kind becomes the status, the message is sent verbatim, and the
// cause, when there is one, is logged and never sent.
package apperr

// Kind is the category of a failure; httpx maps each to an HTTP status.
type Kind int

const (
	KindInvalid      Kind = iota + 1 // 400: the request itself is wrong
	KindUnauthorized                 // 401
	KindForbidden                    // 403: known caller, not allowed
	KindNotFound                     // 404
	KindConflict                     // 409: valid, but the current state refuses it
	KindInternal                     // 500
)

// Error is a failure with a client-safe message. The message is the exact text
// the handler wrote before the logic moved out of it, so moving it changed no
// response.
type Error struct {
	Kind    Kind
	Message string
	Cause   error
}

func (e *Error) Error() string {
	if e.Cause != nil {
		return e.Message + ": " + e.Cause.Error()
	}
	return e.Message
}

func (e *Error) Unwrap() error { return e.Cause }

func Invalid(msg string) error { return &Error{Kind: KindInvalid, Message: msg} }

// InvalidFrom is a 400 caused by a database error. Several handlers answered a
// failed write with 400 rather than 500; that is kept until the API's error
// contract is revisited (refactor step 4).
func InvalidFrom(msg string, cause error) error {
	return &Error{Kind: KindInvalid, Message: msg, Cause: cause}
}

func UnauthorizedFrom(msg string, cause error) error {
	return &Error{Kind: KindUnauthorized, Message: msg, Cause: cause}
}

func Forbidden(msg string) error { return &Error{Kind: KindForbidden, Message: msg} }

func NotFound(msg string) error { return &Error{Kind: KindNotFound, Message: msg} }

func NotFoundFrom(msg string, cause error) error {
	return &Error{Kind: KindNotFound, Message: msg, Cause: cause}
}

func Conflict(msg string) error { return &Error{Kind: KindConflict, Message: msg} }

func Internal(msg string, cause error) error {
	return &Error{Kind: KindInternal, Message: msg, Cause: cause}
}
