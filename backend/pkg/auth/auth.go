package auth

import (
	"crypto/rand"
	"encoding/base64"
)

func GenerateSession() (string, error) {
	bytes := make([]byte, 32)
	_, err := rand.Read(bytes)
	if err != nil {
		return "", err
	}

	token := base64.RawURLEncoding.EncodeToString(bytes)
	return token, nil
}
