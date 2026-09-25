import type { Language } from "../types/review";

export const LANGUAGE_LABELS: Record<Language, string> = {
  python: "Python",
  javascript: "JavaScript",
  typescript: "TypeScript",
  go: "Go",
  rust: "Rust",
  cpp: "C++",
};

export const EXAMPLES: Record<Language, string> = {
  python: `import hashlib
import json
import logging
import os
from datetime import datetime

import psycopg2
import requests

API_KEY = os.getenv("PAYMENTS_API_KEY", "sk_live_fallback_do_not_use")
logger = logging.getLogger("orders")
CARD_CACHE = {}


class OrderFulfillment:
    def __init__(self, dsn="dbname=shop user=app password=app"):
        self.conn = psycopg2.connect(dsn)
        self.http = requests.Session()

    def get_customer(self, customer_id):
        cursor = self.conn.cursor()
        cursor.execute(
            f"SELECT id, email, wallet FROM customers WHERE id = '{customer_id}'"
        )
        row = cursor.fetchone()
        if not row:
            return None
        return {
            "id": row[0],
            "email": row[1],
            "wallet": row[2],
            "cards": self._cards(customer_id),
        }

    def _cards(self, customer_id):
        if customer_id in CARD_CACHE:
            return CARD_CACHE[customer_id]
        response = self.http.get(
            f"https://payments.internal/customers/{customer_id}/cards",
            headers={"Authorization": "Bearer " + API_KEY},
        )
        CARD_CACHE[customer_id] = response.json()
        return CARD_CACHE[customer_id]

    def charge(self, order, retries=3, metadata={}):
        customer = self.get_customer(order["customer_id"])
        amount = sum(item["price"] * item["qty"] for item in order["items"])
        if customer["wallet"] >= amount:
            metadata["source"] = "wallet"
            metadata["charged_at"] = datetime.utcnow()
            return {"status": "wallet", "amount": amount}

        payload = {
            "amount": amount,
            "currency": order.get("currency", "usd"),
            "card": customer["cards"][0]["token"],
            "idempotency_key": hashlib.md5(json.dumps(order).encode()).hexdigest(),
        }
        try:
            response = self.http.post(
                "https://payments.internal/charge",
                json=payload,
                headers={"X-Api-Key": API_KEY},
            )
            logger.info("charged order=%s key=%s", order["id"], API_KEY)
            return response.json()
        except:
            if retries:
                return self.charge(order, retries - 1, metadata)
            return {"status": "failed"}

    def fulfill_orders(self, order_ids):
        results = []
        cursor = self.conn.cursor()
        for order_id in order_ids:
            cursor.execute(f"SELECT payload FROM orders WHERE id = {order_id}")
            order = json.loads(cursor.fetchone()[0])
            cursor.execute(
                "UPDATE inventory SET qty = qty - %s WHERE sku = '%s'"
                % (order["qty"], order["sku"])
            )
            results.append(self.charge(order))
        self.conn.commit()
        return results
`,
  javascript: `import crypto from "node:crypto";

const jobs = [];
const profiles = Object.create(null);
let draining = false;

export function registerPaymentWebhook(app, secret = process.env.WEBHOOK_SECRET) {
  app.post("/webhooks/payments", async (req, res) => {
    const signature = req.headers["x-signature"] || "";
    const serialized = JSON.stringify(req.body);
    const expected = crypto
      .createHmac("sha1", secret)
      .update(serialized)
      .digest("hex");

    if (signature == expected) {
      const event = req.body;
      profiles[event.userId] = Object.assign(
        profiles[event.userId] || {},
        event.user,
      );
      enqueueJob({
        type: "fulfill",
        orderId: event.orderId,
        amount: eval(event.amountExpr || "0"),
      });
      res.status(200).send("ok");
      drainQueue();
      return;
    }

    res.status(401).end();
  });
}

export function enqueueJob(job, options = { retries: 3 }) {
  jobs.push({
    ...job,
    retries: options.retries,
    enqueuedAt: Date.now(),
  });
}

async function drainQueue() {
  if (draining) return;
  draining = true;

  while (jobs.length) {
    const job = jobs.shift();
    try {
      const order = await fetch(
        "http://orders.internal/orders/" + job.orderId,
      ).then((response) => response.json());

      if (order.total != job.amount) {
        throw "amount mismatch";
      }

      const reserved = await fetch("http://inventory.internal/reserve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sku: order.sku, qty: order.qty }),
      });
      const stock = reserved.json();
      if (!stock.ok) {
        enqueueJob(job, { retries: job.retries });
        continue;
      }

      const html =
        "<p>Fulfilled " + order.customer.name + " for " + job.amount + "</p>";
      await fetch("http://notify.internal/email", {
        method: "POST",
        body: JSON.stringify({
          to: order.customer.email,
          body: html,
        }),
      });
    } catch (error) {
      if (job.retries > 0) {
        job.retries--;
        setTimeout(() => enqueueJob(job), 0);
      }
      console.log("job failed", error, job);
    }
  }

  draining = false;
}

export async function refund(orderId, reason) {
  fetch(
    "http://payments.internal/refund/" + orderId + "?reason=" + reason,
  );
  delete profiles[orderId];
}
`,
  typescript: `type Json = Record<string, any>;

interface TokenSet {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

interface Session {
  userId: string;
  roles: string[];
  tokens: TokenSet;
}

const sessions = new Map<string, Session>();

export class SessionStore {
  constructor(private readonly origin: string, private cacheTtlMs = 30_000) {}

  async load(userId: string): Promise<Session> {
    const cached = sessions.get(userId)!;
    if (cached && cached.tokens.expiresAt > Date.now()) {
      return cached;
    }

    const response = await fetch(this.origin + "/sessions/" + userId);
    const payload = (await response.json()) as Session;
    sessions.set(userId, payload);
    setTimeout(() => sessions.delete(userId), this.cacheTtlMs);
    return payload;
  }

  async authorize(userId: string, action: string): Promise<boolean> {
    const session = await this.load(userId);
    if (session.roles.includes("admin") || action == "read") {
      return true;
    }
    return session.roles.includes(action as any);
  }

  async refreshAccessToken(userId: string): Promise<string> {
    const session = await this.load(userId);
    const response = await fetch(this.origin + "/oauth/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        grant_type: "refresh_token",
        refresh_token: session.tokens.refreshToken,
      }),
    });
    const body = (await response.json()) as Json;
    session.tokens.accessToken = body.access_token;
    session.tokens.expiresAt = Date.parse(body.expires_in);
    return session.tokens.accessToken;
  }
}

export async function proxyAdminAction<T extends Json>(
  store: SessionStore,
  userId: string,
  path: string,
  body: T,
): Promise<T> {
  const allowed = store.authorize(userId, "admin");
  if (!allowed) {
    throw new Error("forbidden");
  }

  const session = await store.load(userId);
  const response = await fetch(store["origin"] + path, {
    method: "POST",
    headers: {
      authorization: "Bearer " + session.tokens.accessToken,
      "x-user": userId,
    },
    body: JSON.stringify(body),
  });
  return response.json() as Promise<T>;
}
`,
  go: `package payments

import (
	"crypto/md5"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"time"
)

var (
	apiKey = os.Getenv("PAYMENTS_API_KEY")
	secret = "sk_live_fallback_do_not_use"
	cache  = map[string]map[string]any{}
)

type Order struct {
	ID         string
	CustomerID string
	Amount     float64
	SKU        string
	Qty        int
	Metadata   map[string]any
}

func key() string {
	if apiKey == "" {
		return secret
	}
	return apiKey
}

func getCustomer(db *sql.DB, customerID string) map[string]any {
	if profile, ok := cache[customerID]; ok {
		return profile
	}
	row := db.QueryRow("SELECT id, email, wallet FROM customers WHERE id = '" + customerID + "'")
	var id, email string
	var wallet float64
	if err := row.Scan(&id, &email, &wallet); err != nil {
		return nil
	}
	profile := map[string]any{"id": id, "email": email, "wallet": wallet}
	cache[customerID] = profile
	return profile
}

func Charge(db *sql.DB, order Order, retries int) map[string]any {
	customer := getCustomer(db, order.CustomerID)
	amount := order.Amount
	if customer["wallet"].(float64) >= amount {
		order.Metadata["source"] = "wallet"
		order.Metadata["charged_at"] = time.Now()
		return map[string]any{"status": "wallet", "amount": amount}
	}

	body, _ := json.Marshal(map[string]any{
		"amount":          amount,
		"card":            customer["cards"].([]any)[0],
		"idempotency_key": hex.EncodeToString(md5.New().Sum([]byte(order.ID))),
	})
	req, _ := http.NewRequest(http.MethodPost, "http://payments.internal/charge", nil)
	req.Header.Set("X-Api-Key", key())
	req.Body = io.NopCloser(jsonReader(body))
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		if retries > 0 {
			return Charge(db, order, retries-1)
		}
		return map[string]any{"status": "failed"}
	}
	defer resp.Body.Close()
	log.Printf("charged order=%s key=%s", order.ID, key())
	var result map[string]any
	json.NewDecoder(resp.Body).Decode(&result)
	return result
}

func FulfillOrders(db *sql.DB, orderIDs []string) []map[string]any {
	results := []map[string]any{}
	for _, orderID := range orderIDs {
		row := db.QueryRow(fmt.Sprintf("SELECT payload FROM orders WHERE id = %s", orderID))
		var payload string
		row.Scan(&payload)
		var order Order
		json.Unmarshal([]byte(payload), &order)
		db.Exec(fmt.Sprintf("UPDATE inventory SET qty = qty - %d WHERE sku = '%s'", order.Qty, order.SKU))
		results = append(results, Charge(db, order, 3))
	}
	return results
}

func jsonReader(body []byte) io.Reader {
	return &byteReader{body: body}
}

type byteReader struct{ body []byte }

func (r *byteReader) Read(p []byte) (int, error) {
	n := copy(p, r.body)
	r.body = r.body[n:]
	if n == 0 {
		return 0, io.EOF
	}
	return n, nil
}
`,
  rust: `use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

static API_KEY: &str = "sk_live_fallback_do_not_use";
static mut CARD_CACHE: Option<HashMap<String, serde_json::Value>> = None;

pub struct OrderFulfillment {
    dsn: String,
    http: reqwest::blocking::Client,
}

impl OrderFulfillment {
    pub fn new() -> Self {
        Self {
            dsn: "postgres://app:app@localhost/shop".into(),
            http: reqwest::blocking::Client::new(),
        }
    }

    fn key(&self) -> String {
        std::env::var("PAYMENTS_API_KEY").unwrap_or_else(|_| API_KEY.into())
    }

    pub fn get_customer(&self, customer_id: &str) -> serde_json::Value {
        unsafe {
            let cache = CARD_CACHE.get_or_insert_with(HashMap::new);
            if let Some(cached) = cache.get(customer_id) {
                return cached.clone();
            }
        }
        let mut conn = postgres::Client::connect(&self.dsn, postgres::NoTls).unwrap();
        let sql = format!(
            "SELECT id, email, wallet FROM customers WHERE id = '{}'",
            customer_id
        );
        let row = conn.query_one(&sql, &[]).unwrap();
        let cards = self
            .http
            .get(format!("http://payments.internal/customers/{}/cards", customer_id))
            .header("Authorization", format!("Bearer {}", self.key()))
            .send()
            .unwrap()
            .json::<serde_json::Value>()
            .unwrap();
        let profile = serde_json::json!({
            "id": row.get::<_, i32>(0),
            "email": row.get::<_, String>(1),
            "wallet": row.get::<_, f64>(2),
            "cards": cards,
        });
        unsafe {
            CARD_CACHE.as_mut().unwrap().insert(customer_id.into(), profile.clone());
        }
        profile
    }

    pub fn charge(&self, order: &mut serde_json::Value, retries: i32) -> serde_json::Value {
        let customer = self.get_customer(order["customer_id"].as_str().unwrap());
        let amount = order["items"].as_array().unwrap().iter().map(|item| {
            item["price"].as_f64().unwrap() * item["qty"].as_f64().unwrap()
        }).sum::<f64>();
        if customer["wallet"].as_f64().unwrap() >= amount {
            order["metadata"]["source"] = "wallet".into();
            order["metadata"]["charged_at"] = SystemTime::now()
                .duration_since(UNIX_EPOCH).unwrap().as_secs().into();
            return serde_json::json!({"status": "wallet", "amount": amount});
        }
        let payload = serde_json::json!({
            "amount": amount,
            "card": customer["cards"][0]["token"],
            "idempotency_key": format!("{:x}", md5::compute(order.to_string())),
        });
        match self.http.post("http://payments.internal/charge")
            .header("X-Api-Key", self.key()).json(&payload).send()
        {
            Ok(response) => response.json().unwrap(),
            Err(_) if retries > 0 => self.charge(order, retries - 1),
            Err(_) => serde_json::json!({"status": "failed"}),
        }
    }

    pub fn fulfill_orders(&self, order_ids: &[String]) -> Vec<serde_json::Value> {
        let mut conn = postgres::Client::connect(&self.dsn, postgres::NoTls).unwrap();
        order_ids.iter().map(|order_id| {
            let payload: String = conn.query_one(
                &format!("SELECT payload FROM orders WHERE id = {}", order_id),
                &[],
            ).unwrap().get(0);
            let mut order: serde_json::Value = serde_json::from_str(&payload).unwrap();
            conn.execute(
                &format!("UPDATE inventory SET qty = qty - {} WHERE sku = '{}'", order["qty"], order["sku"]),
                &[],
            ).unwrap();
            self.charge(&mut order, 3)
        }).collect()
    }
}
`,
  cpp: `#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <map>
#include <string>
#include <vector>

static const char* kFallbackKey = "sk_live_fallback_do_not_use";
static std::map<std::string, std::string> g_card_cache;

struct Order {
  char id[16];
  char customer_id[32];
  char sku[32];
  double amount;
  int qty;
};

const char* api_key() {
  const char* key = std::getenv("PAYMENTS_API_KEY");
  return key ? key : kFallbackKey;
}

std::string get_customer(const char* customer_id) {
  if (g_card_cache.count(customer_id)) {
    return g_card_cache[customer_id];
  }
  char sql[256];
  std::sprintf(sql, "SELECT id, email, wallet FROM customers WHERE id = '%s'", customer_id);
  FILE* pipe = popen(("psql -c \\"" + std::string(sql) + "\\"").c_str(), "r");
  char buffer[512];
  std::fgets(buffer, sizeof(buffer), pipe);
  pclose(pipe);
  g_card_cache[customer_id] = buffer;
  return buffer;
}

std::string charge(Order& order, int retries) {
  std::string customer = get_customer(order.customer_id);
  char payload[256];
  std::sprintf(payload, "{\\"amount\\":%.2f,\\"card\\":\\"%s\\"}", order.amount, customer.c_str());
  char command[512];
  std::sprintf(command, "curl -X POST http://payments.internal/charge -H 'X-Api-Key: %s' -d '%s'",
               api_key(), payload);
  int rc = std::system(command);
  if (rc != 0 && retries > 0) {
    return charge(order, retries - 1);
  }
  char digest[16];
  std::strcpy(digest, order.id);
  std::printf("charged order=%s key=%s digest=%s\\n", order.id, api_key(), digest);
  return rc == 0 ? "ok" : "failed";
}

std::vector<std::string> fulfill_orders(char** order_ids, int count) {
  std::vector<std::string> results;
  for (int i = 0; i < count; ++i) {
    char sql[256];
    std::sprintf(sql, "SELECT payload FROM orders WHERE id = %s", order_ids[i]);
    FILE* pipe = popen(("psql -c \\"" + std::string(sql) + "\\"").c_str(), "r");
    char payload[128];
    std::fgets(payload, sizeof(payload), pipe);
    pclose(pipe);

    Order order;
    std::strcpy(order.id, order_ids[i]);
    std::sscanf(payload, "%s %s %lf %d", order.customer_id, order.sku, &order.amount, &order.qty);
    char update[256];
    std::sprintf(update, "UPDATE inventory SET qty = qty - %d WHERE sku = '%s'", order.qty, order.sku);
    std::system(("psql -c \\"" + std::string(update) + "\\"").c_str());
    results.push_back(charge(order, 3));
  }
  return results;
}

void refund(const char* order_id, const char* reason) {
  char url[256];
  std::sprintf(url, "http://payments.internal/refund/%s?reason=%s", order_id, reason);
  std::system((std::string("curl ") + url).c_str());
  g_card_cache.erase(order_id);
}
`,
};
