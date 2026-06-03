// Package main is the entry point for the WiseMoney managed edge.
// The edge is a thin, stateless auth + AI-gateway proxy. It holds NO financial data
// and NO domain logic (Gate-4 decision 16, INV-PROXY-01).
package main

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/y4nn/wisemoney/services/edge/internal/config"
	"github.com/y4nn/wisemoney/services/edge/internal/httpapi"
	"github.com/y4nn/wisemoney/services/edge/internal/store"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		fmt.Fprintf(os.Stderr, "edge: config error: %v\n", err)
		os.Exit(1)
	}

	pool, err := store.NewPool(context.Background(), cfg.DatabaseURL)
	if err != nil {
		fmt.Fprintf(os.Stderr, "edge: postgres pool error: %v\n", err)
		os.Exit(1)
	}
	defer pool.Close()

	router := httpapi.NewRouter(cfg, pool)

	srv := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      router,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Graceful shutdown.
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		fmt.Printf("edge: listening on :%s\n", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			fmt.Fprintf(os.Stderr, "edge: server error: %v\n", err)
			os.Exit(1)
		}
	}()

	<-quit
	fmt.Println("edge: shutting down...")

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		fmt.Fprintf(os.Stderr, "edge: forced shutdown: %v\n", err)
	}
	fmt.Println("edge: stopped")
}
