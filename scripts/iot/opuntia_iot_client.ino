/*
  OpuntiaIndustry — client IoT senza MQTT.
  ESP32/Arduino: POST telemetria + polling comandi sulle API REST del gestionale.

  Configura:
    WIFI_SSID, WIFI_PASS
    API_BASE  = https://TUO-DOMINIO  (senza slash finale)
    DEVICE_CODE e DEVICE_TOKEN dalla scheda macchinario (Collegamento IoT)

  Endpoint:
    POST /api/iot/telemetry
    GET  /api/iot/commands?device_code=...&token=...
    POST /api/iot/commands   { "command_id": "..." }  // ack
*/

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

const char* WIFI_SSID = "TUA_RETE";
const char* WIFI_PASS = "TUA_PASSWORD";
const char* API_BASE = "https://TUO-DOMINIO";
const char* DEVICE_CODE = "PMP-INZ-DSF";
const char* DEVICE_TOKEN = "iot_INCOLLA_IL_TOKEN";
const int POLL_MS = 5000;

bool outputOn = false;
const int RELAY_PIN = 2;

void connectWifi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) {
    delay(400);
  }
}

void sendTelemetry() {
  if (WiFi.status() != WL_CONNECTED) return;
  HTTPClient http;
  http.begin(String(API_BASE) + "/api/iot/telemetry");
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Code", DEVICE_CODE);
  http.addHeader("X-Device-Token", DEVICE_TOKEN);

  JsonDocument doc;
  doc["device_code"] = DEVICE_CODE;
  doc["token"] = DEVICE_TOKEN;
  JsonObject data = doc["data"].to<JsonObject>();
  data["on"] = outputOn;
  data["stato"] = outputOn ? "acceso" : "spento";
  data["rssi"] = WiFi.RSSI();

  String body;
  serializeJson(doc, body);
  http.POST(body);
  http.end();
}

void pollCommands() {
  if (WiFi.status() != WL_CONNECTED) return;
  HTTPClient http;
  String url = String(API_BASE) + "/api/iot/commands?device_code=" +
               String(DEVICE_CODE) + "&token=" + String(DEVICE_TOKEN);
  http.begin(url);
  int code = http.GET();
  if (code == 200) {
    JsonDocument doc;
    deserializeJson(doc, http.getString());
    JsonArray cmds = doc["commands"].as<JsonArray>();
    for (JsonObject c : cmds) {
      const char* command = c["command"];
      const char* id = c["id"];
      if (!command || !id) continue;
      if (strcmp(command, "POWER_ON") == 0) {
        outputOn = true;
        digitalWrite(RELAY_PIN, HIGH);
      } else if (strcmp(command, "POWER_OFF") == 0) {
        outputOn = false;
        digitalWrite(RELAY_PIN, LOW);
      }
      ackCommand(id);
    }
  }
  http.end();
}

void ackCommand(const char* commandId) {
  HTTPClient http;
  http.begin(String(API_BASE) + "/api/iot/commands");
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Code", DEVICE_CODE);
  http.addHeader("X-Device-Token", DEVICE_TOKEN);
  JsonDocument doc;
  doc["device_code"] = DEVICE_CODE;
  doc["token"] = DEVICE_TOKEN;
  doc["command_id"] = commandId;
  String body;
  serializeJson(doc, body);
  http.POST(body);
  http.end();
}

void setup() {
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, LOW);
  connectWifi();
}

void loop() {
  sendTelemetry();
  pollCommands();
  delay(POLL_MS);
}
