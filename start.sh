#!/bin/bash

ghostty -e "cd frontend && pnpm run dev" &
ghostty -e "cd backend && env \$(cat .env | xargs) go run cmd/server/main.go" &