package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/go-chi/jwtauth/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/resend/resend-go/v2"
	"golang.org/x/oauth2"
	"stackhub.com/stackhub/pkg/db"
	"stackhub.com/stackhub/pkg/mail"
)

type OAuthConfig struct {
	Github oauth2.Config
}

type App struct {
	bucket             *s3.Client
	bucketName         *string
	supabaseProjectRef *string
	db                 *pgxpool.Pool
	queries            *db.Queries
	mailer             *mail.Mailer
}

// siteURL is the public site origin, used to build links inside emails.
const siteURL = "https://stackhub.me"

type GithubUser struct {
	Login string `json:"login"`
	Email string `json:"email"`
}

func getEnvOrPanic(key string) string {
	env, set := os.LookupEnv(key)

	if !set {
		log.Panicln("Missing env:", key)
	}

	return env
}

func main() {
	// Setup logger to show line numbers
	log.SetFlags(log.LstdFlags | log.Lshortfile)

	ctx := context.Background()

	customResolver := aws.EndpointResolverWithOptionsFunc(
		func(service, region string, options ...interface{}) (aws.Endpoint, error) {
			if service == s3.ServiceID {
				return aws.Endpoint{
					URL:               getEnvOrPanic("S3_ENDPOINT"),
					SigningRegion:     region,
					HostnameImmutable: true,
				}, nil
			}
			return aws.Endpoint{}, fmt.Errorf("unknown endpoint requested")
		})

	// Load AWS config with custom settings
	cfg, err := config.LoadDefaultConfig(context.TODO(),
		config.WithRegion(getEnvOrPanic("S3_REGION")),
		config.WithEndpointResolverWithOptions(customResolver),
		config.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(
			getEnvOrPanic("S3_ACCESS_KEY"),
			getEnvOrPanic("S3_SECRET_ACCESS_KEY"),
			"",
		)),
	)

	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	bucket := s3.NewFromConfig(cfg)

	config, err := pgxpool.ParseConfig(getEnvOrPanic("DB_CONNECTION"))
	if err != nil {
		log.Panicln(err)
	}

	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		log.Panicln(err)
	}

	queries := db.New(pool)

	jwtSecret := []byte(getEnvOrPanic("JWT_SECRET"))

	tokenAuth := jwtauth.New("HS256", jwtSecret, jwtSecret)

	resendClient := resend.NewClient(getEnvOrPanic("RESEND_API_KEY"))

	mailer, err := mail.NewMailer(resendClient, "updates.stackhub.me")
	if err != nil {
		log.Panicln(err)
	}

	supabaseProjectRef := getEnvOrPanic("SUPABASE_PROJECT_REF")

	app := App{
		db:                 pool,
		queries:            queries,
		bucket:             bucket,
		supabaseProjectRef: &supabaseProjectRef,
		bucketName:         aws.String(getEnvOrPanic("S3_BUCKET_NAME")),
		mailer:             mailer,
	}

	err = http.ListenAndServe("localhost:8080", app.routes(tokenAuth))

	if err != nil {
		log.Panicln(err)
	}
}
