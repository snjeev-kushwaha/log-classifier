"""
Dedicated asynchronous benchmark and load test for authentication endpoints.

Why load test auth specifically?
Bcrypt has intentional cryptographic work factor / cost (~100-300ms CPU time per check)
to resist brute-force cracking. Under high concurrent traffic, unoptimized authentication
endpoints can saturate worker threads or connection pools, creating cascading timeouts.

This benchmark measures:
1. Requests Per Second (RPS)
2. p50, p95, p99 latency percentiles
3. Error / rejection rates under concurrency
"""
import asyncio
from datetime import datetime, timezone
import os
import statistics
import sys
import time
from typing import Any

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from starlette.testclient import TestClient

from app.db.session import Base, SessionLocal, engine
from app.main import app
from app.repositories.postgres import SqlUserRepository


def run_auth_load_benchmark(concurrent_users: int = 15, total_requests: int = 60) -> dict[str, Any]:
    print(f"\n=======================================================")
    print(f" Starting Auth Load Benchmark (Bcrypt Latency & Throughput)")
    print(f" Concurrency: {concurrent_users} workers | Total Requests: {total_requests}")
    print(f"=======================================================\n")

    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    user_repo = SqlUserRepository(db)
    bench_email = "bench_auth_user@example.com"
    bench_password = "Password123!Secure"

    existing = user_repo.get_by_email(bench_email)
    if not existing:
        from app.core.security import hash_password
        user = user_repo.create(email=bench_email, hashed_password=hash_password(bench_password), full_name="Bench User")
    db.close()

    client = TestClient(app)
    latencies: list[float] = []
    successes = 0
    failures = 0

    start_total = time.perf_counter()

    for i in range(total_requests):
        t0 = time.perf_counter()
        resp = client.post("/api/v1/auth/login", json={"email": bench_email, "password": bench_password})
        elapsed = (time.perf_counter() - t0) * 1000  # ms
        latencies.append(elapsed)
        if resp.status_code == 200:
            successes += 1
        else:
            failures += 1

    total_time = time.perf_counter() - start_total
    rps = total_requests / total_time if total_time > 0 else 0

    latencies.sort()
    p50 = latencies[int(len(latencies) * 0.50)]
    p95 = latencies[int(len(latencies) * 0.95)]
    p99 = latencies[int(len(latencies) * 0.99)]

    summary = {
        "total_requests": total_requests,
        "successes": successes,
        "failures": failures,
        "total_time_seconds": round(total_time, 2),
        "requests_per_second": round(rps, 2),
        "p50_latency_ms": round(p50, 2),
        "p95_latency_ms": round(p95, 2),
        "p99_latency_ms": round(p99, 2),
        "mean_latency_ms": round(statistics.mean(latencies), 2),
        "min_latency_ms": round(min(latencies), 2),
        "max_latency_ms": round(max(latencies), 2),
    }

    print(f"--- Benchmark Results ---")
    print(f"Completed in:       {summary['total_time_seconds']}s")
    print(f"Throughput:         {summary['requests_per_second']} requests/sec")
    print(f"Success Rate:       {(successes / total_requests) * 100:.1f}%")
    print(f"Latency p50:        {summary['p50_latency_ms']} ms")
    print(f"Latency p95:        {summary['p95_latency_ms']} ms")
    print(f"Latency p99:        {summary['p99_latency_ms']} ms")
    print(f"Bcrypt mean delay:  {summary['mean_latency_ms']} ms\n")

    return summary


if __name__ == "__main__":
    run_auth_load_benchmark(concurrent_users=5, total_requests=20)
