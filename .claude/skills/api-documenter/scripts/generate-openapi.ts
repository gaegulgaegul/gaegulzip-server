#!/usr/bin/env tsx

/**
 * OpenAPI 3.0 문서 자동 생성 스크립트
 *
 * 사용법:
 *   tsx generate-openapi.ts <feature-name>
 *
 * 예시:
 *   tsx generate-openapi.ts users
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

interface OpenAPIPath {
  [method: string]: {
    summary: string;
    description?: string;
    tags: string[];
    parameters?: Array<{
      in: string;
      name: string;
      required: boolean;
      schema: { type: string };
      description: string;
    }>;
    requestBody?: {
      required: boolean;
      content: {
        'application/json': {
          schema: Record<string, unknown>;
        };
      };
    };
    responses: Record<string, {
      description: string;
      content?: {
        'application/json': {
          schema: Record<string, unknown>;
        };
      };
    }>;
  };
}

interface OpenAPISchema {
  type: string;
  properties: Record<string, unknown>;
  required?: string[];
}

interface OpenAPIDocument {
  openapi: string;
  info: {
    title: string;
    version: string;
    description: string;
  };
  servers: Array<{
    url: string;
    description: string;
  }>;
  paths: Record<string, OpenAPIPath>;
  components: {
    schemas: Record<string, OpenAPISchema>;
  };
  tags: Array<{
    name: string;
    description: string;
  }>;
}

/**
 * handlers.ts에서 JSDoc 주석 파싱
 */
function parseHandlers(filePath: string): Record<string, { summary: string; params: string[]; returns: string }> {
  if (!existsSync(filePath)) {
    throw new Error(`handlers.ts not found: ${filePath}`);
  }

  const content = readFileSync(filePath, 'utf-8');
  const handlers: Record<string, { summary: string; params: string[]; returns: string }> = {};

  // JSDoc 주석과 함수명 추출
  const regex = /\/\*\*\s*([\s\S]*?)\*\/\s*export\s+const\s+(\w+)/g;
  let match;

  while ((match = regex.exec(content)) !== null) {
    const [, comment, handlerName] = match;
    const lines = comment.split('\n').map((line) => line.trim().replace(/^\*\s?/, ''));

    const summary = lines.find((line) => !line.startsWith('@'))?.trim() || '';
    const params = lines
      .filter((line) => line.startsWith('@param'))
      .map((line) => line.replace('@param', '').trim());
    const returns = lines.find((line) => line.startsWith('@returns'))?.replace('@returns', '').trim() || '';

    handlers[handlerName] = { summary, params, returns };
  }

  return handlers;
}

/**
 * index.ts (Router)에서 라우트 정보 추출
 */
function parseRouter(filePath: string): Array<{ method: string; path: string; handler: string }> {
  if (!existsSync(filePath)) {
    throw new Error(`index.ts not found: ${filePath}`);
  }

  const content = readFileSync(filePath, 'utf-8');
  const routes: Array<{ method: string; path: string; handler: string }> = [];

  // router.method('path', handlers.handlerName) 패턴 추출
  const regex = /router\.(get|post|put|patch|delete)\(['"]([^'"]+)['"],\s*handlers\.(\w+)\)/g;
  let match;

  while ((match = regex.exec(content)) !== null) {
    const [, method, path, handler] = match;
    routes.push({ method: method.toUpperCase(), path, handler });
  }

  return routes;
}

/**
 * schema.ts에서 Drizzle 스키마 정보 추출
 */
function parseSchema(filePath: string): OpenAPISchema | null {
  if (!existsSync(filePath)) {
    console.warn(`schema.ts not found: ${filePath}`);
    return null;
  }

  // 간단한 기본 스키마
  const schema: OpenAPISchema = {
    type: 'object',
    properties: {
      id: { type: 'integer', description: 'ID' },
      createdAt: { type: 'string', format: 'date-time', description: '생성 일시' },
      updatedAt: { type: 'string', format: 'date-time', description: '수정 일시' },
    },
    required: ['id', 'createdAt', 'updatedAt'],
  };

  return schema;
}

/**
 * OpenAPI 문서 생성
 */
function generateOpenAPI(featureName: string): OpenAPIDocument {
  const projectRoot = process.cwd();
  const modulePath = join(projectRoot, 'src', 'modules', featureName);

  const handlersPath = join(modulePath, 'handlers.ts');
  const routerPath = join(modulePath, 'index.ts');
  const schemaPath = join(modulePath, 'schema.ts');

  // 파일 파싱
  const handlers = parseHandlers(handlersPath);
  const routes = parseRouter(routerPath);
  const schema = parseSchema(schemaPath);

  // OpenAPI 문서 초기화
  const doc: OpenAPIDocument = {
    openapi: '3.0.0',
    info: {
      title: 'gaegulzip-server API',
      version: '1.0.0',
      description: 'gaegulzip-server RESTful API Documentation',
    },
    servers: [
      {
        url: 'http://localhost:3001/api/v1',
        description: 'Development server',
      },
    ],
    paths: {},
    components: {
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string', description: '에러 메시지' },
          },
          required: ['error'],
        },
      },
    },
    tags: [
      {
        name: featureName.charAt(0).toUpperCase() + featureName.slice(1),
        description: `${featureName} 관리 API`,
      },
    ],
  };

  // 스키마 추가
  if (schema) {
    const schemaName = featureName.charAt(0).toUpperCase() + featureName.slice(1).replace(/s$/, '');
    doc.components.schemas[schemaName] = schema;
  }

  // 라우트 추가
  for (const route of routes) {
    const { method, path, handler } = route;
    const handlerInfo = handlers[handler] || { summary: '', params: [], returns: '' };

    const fullPath = `/${featureName}${path}`;

    if (!doc.paths[fullPath]) {
      doc.paths[fullPath] = {};
    }

    doc.paths[fullPath][method.toLowerCase()] = {
      summary: handlerInfo.summary || `${method} ${fullPath}`,
      tags: [featureName.charAt(0).toUpperCase() + featureName.slice(1)],
      responses: {
        '200': {
          description: '성공',
          content: {
            'application/json': {
              schema: { type: 'object', properties: { data: { type: 'object' } } },
            },
          },
        },
        '500': {
          description: '서버 에러',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
            },
          },
        },
      },
    };

    // Path 파라미터 추가
    if (path.includes(':id')) {
      doc.paths[fullPath][method.toLowerCase()].parameters = [
        {
          in: 'path',
          name: 'id',
          required: true,
          schema: { type: 'integer' },
          description: 'ID',
        },
      ];
    }

    // Request Body 추가 (POST, PUT, PATCH)
    if (['POST', 'PUT', 'PATCH'].includes(method)) {
      doc.paths[fullPath][method.toLowerCase()].requestBody = {
        required: true,
        content: {
          'application/json': {
            schema: { type: 'object' },
          },
        },
      };
    }
  }

  return doc;
}

/**
 * YAML 직렬화 (간단한 버전)
 */
function toYAML(obj: unknown, indent = 0): string {
  const spaces = '  '.repeat(indent);

  if (obj === null || obj === undefined) {
    return 'null';
  }

  if (typeof obj === 'string') {
    return `"${obj}"`;
  }

  if (typeof obj === 'number' || typeof obj === 'boolean') {
    return String(obj);
  }

  if (Array.isArray(obj)) {
    if (obj.length === 0) return '[]';
    return '\n' + obj.map(item => `${spaces}- ${toYAML(item, indent + 1).trimStart()}`).join('\n');
  }

  if (typeof obj === 'object') {
    const entries = Object.entries(obj);
    if (entries.length === 0) return '{}';
    return '\n' + entries.map(([key, value]) => {
      const valueStr = toYAML(value, indent + 1);
      if (valueStr.startsWith('\n')) {
        return `${spaces}${key}:${valueStr}`;
      }
      return `${spaces}${key}: ${valueStr}`;
    }).join('\n');
  }

  return String(obj);
}

/**
 * 메인 함수
 */
function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage: tsx generate-openapi.ts <feature-name>');
    console.error('Example: tsx generate-openapi.ts users');
    process.exit(1);
  }

  const featureName = args[0];

  try {
    console.log(`Generating OpenAPI documentation for: ${featureName}`);

    const doc = generateOpenAPI(featureName);

    // YAML 파일로 저장
    const outputPath = join(process.cwd(), 'docs', 'openapi.yaml');
    const yamlContent = toYAML(doc).trimStart();

    writeFileSync(outputPath, yamlContent, 'utf-8');

    console.log(`✅ OpenAPI documentation generated: ${outputPath}`);
    console.log('\nNext steps:');
    console.log('1. Review the generated documentation');
    console.log('2. Test with Swagger UI (optional)');
    console.log('3. Share with your team');
  } catch (error) {
    console.error('❌ Error generating OpenAPI documentation:');
    console.error(error);
    process.exit(1);
  }
}

// 스크립트 실행
main();
