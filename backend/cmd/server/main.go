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
	"stackhub.com/stackhub/internal/pg"
	"stackhub.com/stackhub/internal/storage"
	"stackhub.com/stackhub/pkg/db"
	"stackhub.com/stackhub/pkg/mail"
)

// App is everything the modules depend on, built once at startup. routes()
// hands each module only the parts it uses. Tests build one around a
// rollback transaction (db is a pg.TxBeginner) and no mailer or bucket.
type App struct {
	bucket  *storage.Bucket
	db      pg.TxBeginner
	queries *db.Queries
	mailer  *mail.Mailer
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
		db:      pool,
		queries: queries,
		bucket: &storage.Bucket{
			Client:     bucket,
			Name:       getEnvOrPanic("S3_BUCKET_NAME"),
			ProjectRef: supabaseProjectRef,
		},
		mailer: mailer,
	}

	err = http.ListenAndServe("localhost:8080", app.routes(tokenAuth))

	if err != nil {
		log.Panicln(err)
	}
}
