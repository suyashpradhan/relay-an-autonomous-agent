interface Fetcher {
  fetch(request: Request): Promise<Response>;
}

interface D1Database {
  readonly __relayD1Brand?: "D1Database";
}
