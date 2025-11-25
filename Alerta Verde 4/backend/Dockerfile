FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

# Instalar compilador, sqlite e openssl
RUN apt-get update && apt-get install -y \
    g++ \
    libsqlite3-dev \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

# Copiar código fonte
COPY main.cpp .

# Compilar o servidor
RUN g++ -std=c++11 -o backend main.cpp -lsqlite3 -lssl -lcrypto -lpthread

# Criar diretório de dados
RUN mkdir -p /data

EXPOSE 8080

CMD ["./backend"]