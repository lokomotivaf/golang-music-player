FROM golang:1.20-alpine AS builder

ENV GO111MODULE=on

WORKDIR /build

COPY . .
RUN go mod download

RUN go build -o main -tags musl .

FROM alpine:latest as baseImage

EXPOSE 5420

WORKDIR /opt

COPY --from=builder /build/main /opt/main
COPY --from=builder /build/music/ /opt/music/
COPY --from=builder /build/static/ /opt/static/

CMD ["/opt/main"]
