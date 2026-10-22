declare module "node:path" {
  const path: {
    resolve: (...segments: string[]) => string;
    join: (...segments: string[]) => string;
    dirname: (p: string) => string;
    basename: (p: string) => string;
  };
  export default path;
}

declare module "node:fs" {
  const fs: {
    existsSync: (p: string) => boolean;
    readFileSync: (p: string, enc: string) => string;
    rmSync: (p: string, options?: unknown) => void;
  };
  export default fs;
}

declare module "node:url" {
  export function fileURLToPath(url: string): string;
}

declare module "node:http" {
  export interface IncomingMessage {
    method?: string;
    url?: string;
    on(event: "data", cb: (chunk: string | Uint8Array) => void): void;
    on(event: "end" | "close", cb: () => void): void;
  }
  export interface ServerResponse {
    setHeader(name: string, value: string): void;
    writeHead(status: number, headers?: Record<string, string>): void;
    write(chunk: string): void;
    end(body?: string): void;
  }
  export interface Server {
    listen(port: number, host: string, cb: () => void): void;
    address(): { port: number } | string | null;
    close(cb: () => void): void;
  }
  const http: {
    createServer: (handler: (req: IncomingMessage, res: ServerResponse) => void) => Server;
  };
  export default http;
}
