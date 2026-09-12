"""
Locust load testing script for high-concurrency stress testing of auth & classification endpoints.
Run with: locust -f backend/tests/load/locustfile.py --host=http://localhost:8000
"""
from locust import HttpUser, between, task


class LogClassifierUser(HttpUser):
    wait_time = between(0.1, 1.0)

    def on_start(self):
        # Register or login test user
        self.email = f"loadtest_{self.environment.runner.user_count if self.environment.runner else 1}@example.com"
        self.password = "LoadTest123!"
        self.client.post("/api/v1/auth/signup", json={
            "email": self.email,
            "password": self.password,
            "full_name": "Load Test User",
        })
        login_res = self.client.post("/api/v1/auth/login", json={
            "email": self.email,
            "password": self.password,
        })
        if login_res.status_code == 200:
            tokens = login_res.json()
            self.access_token = tokens.get("access_token")
            self.refresh_token = tokens.get("refresh_token")
            self.headers = {"Authorization": f"Bearer {self.access_token}"}
        else:
            self.access_token = None
            self.refresh_token = None
            self.headers = {}

    @task(3)
    def classify_log(self):
        self.client.post(
            "/api/v1/classify",
            json={"text": "User auth failed for admin from IP 192.168.1.5"},
            headers=self.headers,
        )

    @task(1)
    def check_quota(self):
        if self.access_token:
            self.client.get("/api/v1/quota", headers=self.headers)

    @task(1)
    def refresh_auth_token(self):
        if self.refresh_token:
            res = self.client.post("/api/v1/auth/refresh", json={"refresh_token": self.refresh_token})
            if res.status_code == 200:
                data = res.json()
                self.access_token = data.get("access_token")
                self.refresh_token = data.get("refresh_token")
                self.headers = {"Authorization": f"Bearer {self.access_token}"}
