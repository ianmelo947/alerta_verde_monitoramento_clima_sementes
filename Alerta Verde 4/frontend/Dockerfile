FROM node:16-alpine

# Instalar http-server globalmente
RUN npm install -g http-server

WORKDIR /usr/src/app

# Copiar todos os arquivos do frontend
COPY . .

EXPOSE 8080

CMD ["http-server", ".", "-p", "8080", "--cors", "-d", "false"]