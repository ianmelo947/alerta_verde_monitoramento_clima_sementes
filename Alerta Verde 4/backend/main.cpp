#include <iostream>
#include <sqlite3.h>
#include <openssl/sha.h>
#include <regex>
#include <unordered_map>
#include <string>
#include <sstream>
#include <sys/socket.h>
#include <netinet/in.h>
#include <unistd.h>
#include <cstring>

using namespace std;

sqlite3* db = nullptr;

// Classe JSON Simples
class Json {
private:
    unordered_map<string, string> data;
public:
    void set(const string& key, const string& value) {
        data[key] = value;
    }
    
    string get(const string& key, const string& def = "") const {
        auto it = data.find(key);
        return (it != data.end() ? it->second : def);
    }
    
    static Json parse(const string& jsonStr) {
        Json result;
        // Regex para capturar chaves e valores simples
        regex reg("\"([^\"]+)\"\\s*:\\s*\"?([^\",}]+)\"?");
        auto begin = sregex_iterator(jsonStr.begin(), jsonStr.end(), reg);
        auto end = sregex_iterator();
        for(auto it = begin; it != end; ++it) {
            string key = (*it)[1];
            string value = (*it)[2];
            // Remove aspas residuais se sobrarem
            if (!value.empty() && value.back() == '"') value.pop_back();
            result.data[key] = value;
        }
        return result;
    }
    
    string dump() const {
        string out = "{";
        bool first = true;
        for (auto &p : data) {
            if (!first) out += ",";
            first = false;
            out += "\"" + p.first + "\":\"" + p.second + "\"";
        }
        out += "}";
        return out;
    }
};

// Utilitários
string hashPassword(const string& password) {
    unsigned char hash[SHA256_DIGEST_LENGTH];
    SHA256((const unsigned char*)password.c_str(), password.length(), hash);
    string result;
    char buffer[3];
    for(int i = 0; i < SHA256_DIGEST_LENGTH; i++) {
        snprintf(buffer, sizeof(buffer), "%02x", hash[i]);
        result += buffer;
    }
    return result;
}

string generateToken() {
    return "sessao_" + to_string(rand());
}

// Banco de Dados
bool initDatabase() {
    int rc = sqlite3_open("/data/db.sqlite", &db);
    if (rc) {
        cerr << "Erro ao abrir DB: " << sqlite3_errmsg(db) << endl;
        return false;
    }

    const char* createTableSQL = 
        "CREATE TABLE IF NOT EXISTS users ("
        "id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, email TEXT UNIQUE, password_hash TEXT);"
        "CREATE TABLE IF NOT EXISTS crops ("
        "id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, name TEXT, type TEXT, planting_date TEXT, area REAL);";

    char* errMsg = nullptr;
    sqlite3_exec(db, createTableSQL, nullptr, nullptr, &errMsg);
    cout << "Banco de dados inicializado." << endl;
    return true;
}

// HTTP Helpers
string getRequestBody(const string& request) {
    size_t header_end = request.find("\r\n\r\n");
    if (header_end == string::npos) return "";
    return request.substr(header_end + 4);
}

string getRequestMethod(const string& request) {
    stringstream ss(request);
    string method;
    ss >> method;
    return method;
}

string getRequestPath(const string& request) {
    stringstream ss(request);
    string method, path;
    ss >> method >> path;
    return path;
}

void sendResponse(int clientSocket, const string& body, int statusCode = 200) {
    string statusMsg = (statusCode == 200) ? "OK" : (statusCode == 404 ? "Not Found" : "Bad Request");
    stringstream ss;
    ss << "HTTP/1.1 " << statusCode << " " << statusMsg << "\r\n";
    ss << "Content-Type: application/json\r\n";
    // CORS Headers (Essenciais para funcionar com o Frontend)
    ss << "Access-Control-Allow-Origin: *\r\n";
    ss << "Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS\r\n";
    ss << "Access-Control-Allow-Headers: Content-Type, Authorization\r\n";
    ss << "Content-Length: " << body.size() << "\r\n\r\n";
    ss << body;
    
    string out = ss.str();
    send(clientSocket, out.c_str(), out.size(), 0);
}

// Handlers (Controladores)
void handleRegister(const string& body, int clientSocket) {
    Json js = Json::parse(body);
    string name = js.get("name");
    string email = js.get("email");
    string password = js.get("password");
    
    string sql = "INSERT INTO users (name, email, password_hash) VALUES ('" + name + "', '" + email + "', '" + hashPassword(password) + "');";
    
    Json response;
    if (sqlite3_exec(db, sql.c_str(), nullptr, nullptr, nullptr) == SQLITE_OK) {
        response.set("success", "true");
        response.set("message", "Usuario criado!");
    } else {
        response.set("success", "false");
        response.set("message", "Email ja existe ou erro no banco.");
    }
    sendResponse(clientSocket, response.dump());
}

void handleLogin(const string& body, int clientSocket) {
    Json js = Json::parse(body);
    string email = js.get("email");
    string passwordHash = hashPassword(js.get("password"));
    
    string sql = "SELECT name, email FROM users WHERE email='" + email + "' AND password_hash='" + passwordHash + "'";
    sqlite3_stmt* stmt;
    
    Json response;
    if (sqlite3_prepare_v2(db, sql.c_str(), -1, &stmt, nullptr) == SQLITE_OK) {
        if (sqlite3_step(stmt) == SQLITE_ROW) {
            response.set("success", "true");
            response.set("token", generateToken());
            response.set("user_name", string(reinterpret_cast<const char*>(sqlite3_column_text(stmt, 0))));
            response.set("user_email", string(reinterpret_cast<const char*>(sqlite3_column_text(stmt, 1))));
        } else {
            response.set("success", "false");
            response.set("message", "Credenciais invalidas");
        }
        sqlite3_finalize(stmt);
    } else {
        response.set("success", "false");
        response.set("message", "Erro SQL");
    }
    sendResponse(clientSocket, response.dump());
}

void handleGetCrops(int clientSocket) {
    // Em produção, pegaríamos o ID do usuário pelo Token. Aqui usaremos ID 1 fixo.
    string sql = "SELECT id, name, type, planting_date, area FROM crops WHERE user_id = 1";
    sqlite3_stmt* stmt;
    
    string jsonArr = "[";
    bool first = true;
    
    if (sqlite3_prepare_v2(db, sql.c_str(), -1, &stmt, nullptr) == SQLITE_OK) {
        while (sqlite3_step(stmt) == SQLITE_ROW) {
            if (!first) jsonArr += ",";
            first = false;
            jsonArr += "{";
            jsonArr += "\"id\":" + to_string(sqlite3_column_int(stmt, 0)) + ",";
            jsonArr += "\"name\":\"" + string(reinterpret_cast<const char*>(sqlite3_column_text(stmt, 1))) + "\",";
            jsonArr += "\"type\":\"" + string(reinterpret_cast<const char*>(sqlite3_column_text(stmt, 2))) + "\",";
            jsonArr += "\"plantingDate\":\"" + string(reinterpret_cast<const char*>(sqlite3_column_text(stmt, 3))) + "\",";
            jsonArr += "\"area\":\"" + to_string(sqlite3_column_double(stmt, 4)) + "\"";
            jsonArr += "}";
        }
        sqlite3_finalize(stmt);
    }
    jsonArr += "]";
    
    // Envelopa o array em um objeto JSON
    string finalJson = "{\"crops\": " + jsonArr + "}";
    sendResponse(clientSocket, finalJson);
}

void handleAddCrop(const string& body, int clientSocket) {
    Json js = Json::parse(body);
    // Nota: Estamos fixando user_id = 1 para simplificar
    string sql = "INSERT INTO crops (user_id, name, type, planting_date, area) VALUES (1, '" + 
                 js.get("name") + "', '" + js.get("type") + "', '" + js.get("plantingDate") + "', " + js.get("area") + ");";
    
    sqlite3_exec(db, sql.c_str(), nullptr, nullptr, nullptr);
    
    Json response;
    response.set("success", "true");
    sendResponse(clientSocket, response.dump());
}

void handleDeleteCrop(int id, int clientSocket) {
    string sql = "DELETE FROM crops WHERE id=" + to_string(id);
    sqlite3_exec(db, sql.c_str(), nullptr, nullptr, nullptr);
    
    Json response;
    response.set("success", "true");
    sendResponse(clientSocket, response.dump());
}

int main() {
    if (!initDatabase()) return 1;

    int sockfd = socket(AF_INET, SOCK_STREAM, 0);
    int opt = 1;
    setsockopt(sockfd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt)); // Libera a porta rapidamente ao reiniciar

    sockaddr_in addr{};
    addr.sin_family = AF_INET;
    addr.sin_port = htons(8080);
    addr.sin_addr.s_addr = INADDR_ANY;

    if (bind(sockfd, (sockaddr*)&addr, sizeof(addr)) < 0) {
        cerr << "Erro no bind" << endl;
        return 1;
    }
    listen(sockfd, 10);

    cout << "Servidor C++ Rodando na porta 8080..." << endl;

    while(true) {
        int client = accept(sockfd, nullptr, nullptr);
        if (client < 0) continue;

        char buffer[4096] = {0};
        read(client, buffer, 4096);
        string request(buffer);
        
        if (request.empty()) { close(client); continue; }

        string method = getRequestMethod(request);
        string path = getRequestPath(request);
        string body = getRequestBody(request);

        cout << "REQ: " << method << " " << path << endl;

        // Preflight CORS request
        if (method == "OPTIONS") {
            sendResponse(client, "", 204);
            close(client);
            continue;
        }

        // Roteamento
        if (path == "/api/register" && method == "POST") handleRegister(body, client);
        else if (path == "/api/login" && method == "POST") handleLogin(body, client);
        else if (path == "/api/crops" && method == "GET") handleGetCrops(client);
        else if (path == "/api/crops" && method == "POST") handleAddCrop(body, client);
        else if (path.find("/api/crops/") == 0 && method == "DELETE") {
            try {
                string idStr = path.substr(11); // /api/crops/ é tamanho 11
                handleDeleteCrop(stoi(idStr), client);
            } catch (...) {
                sendResponse(client, "{\"error\":\"Invalid ID\"}", 400);
            }
        }
        else {
            sendResponse(client, "{\"error\":\"Not Found\"}", 404);
        }

        close(client);
    }
    return 0;
}