package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/go-chi/jwtauth/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/resend/resend-go/v2"
	"stackhub.com/stackhub/internal/pg"
	"stackhub.com/stackhub/internal/storage"
	"stackhub.com/stackhub/internal/ticket"
	"stackhub.com/stackhub/pkg/db"
	"stackhub.com/stackhub/pkg/mail"
	shmiddleware "stackhub.com/stackhub/pkg/middleware"
)

// App is everything the modules depend on, built once at startup. routes()
// hands each module only the parts it uses. Tests build one around a
// rollback transaction (db is a pg.TxBeginner) and no mailer or bucket.
type App struct {
	bucket  *storage.Bucket
	db      pg.TxBeginner
	queries *db.Queries
	mailer  *mail.Mailer
	alerter *ticket.Alerter // nil when ADMIN_NOTIFY_EMAILS is unset, and in tests

	// isAdmin decides who may use /admin. Unset in production, where
	// adminChecker falls back to the admins table; route and integration tests
	// set it to stand in for the database.
	isAdmin shmiddleware.AdminChecker
}

// adminChecker is what RequireAdmin asks on every /admin request: the injected
// stub if there is one, otherwise a lookup in the admins table. It is built
// without touching the database, and with no database at all (the route-table
// test builds an App with none) it answers with an error, so it fails closed.
func (app *App) adminChecker() shmiddleware.AdminChecker {
	if app.isAdmin != nil {
		return app.isAdmin
	}
	return func(ctx context.Context, userID uuid.UUID) (bool, error) {
		if app.queries == nil {
			return false, errors.New("admin check: no database configured")
		}
		return app.queries.IsAdmin(ctx, userID)
	}
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

	// Optional: unset turns admin "new tool suggested" alerts off. Neither the
	// raw value nor the parse error is logged: they are admin addresses.
	var alerter *ticket.Alerter
	recipients, rerr := mail.ParseRecipients(os.Getenv("ADMIN_NOTIFY_EMAILS"), 10)
	switch {
	case rerr != nil:
		log.Println("admin tool alerts disabled: ADMIN_NOTIFY_EMAILS is invalid")
	case len(recipients) == 0:
		log.Println("admin tool alerts disabled: ADMIN_NOTIFY_EMAILS is not set")
	default:
		alertCfg := ticket.DefaultAlerterConfig()
		alertCfg.Recipients = len(recipients)
		alerter = ticket.NewAlerter(
			ticket.LoadAlertsFrom(queries),
			[]ticket.AlertChannel{ticket.EmailChannel{Mailer: mailer, To: recipients}},
			alertCfg,
		)
		go alerter.Run(ctx)
		log.Printf("admin tool alerts on: %d recipient(s)", len(recipients))
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
		mailer:  mailer,
		alerter: alerter,
	}

	err = http.ListenAndServe("localhost:8080", app.routes(tokenAuth))

	if err != nil {
		log.Panicln(err)
	}
}
