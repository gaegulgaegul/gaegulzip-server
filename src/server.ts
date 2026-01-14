import express, { Request, Response, NextFunction } from 'express';

const app = express();
const PORT = process.env.PORT || 3001;

// JSON 파싱 미들웨어
app.use(express.json());

// 기본 라우트 (Spring Boot @GetMapping("/")처럼)
app.get('/', (req: Request, res: Response) => {
    res.json({
        message: 'Hello World! 🚀',
        timestamp: new Date().toISOString(),
        port: PORT
    });
});

// 헬스 체크
app.get('/health', (req: Request, res: Response) => {
    res.status(200).json({ status: 'OK', uptime: process.uptime() });
});

// 404 핸들러
app.use((req: Request, res: Response) => {
    res.status(404).json({ error: 'Not Found' });
});

// 에러 핸들러
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Internal Server Error' });
});

app.listen(PORT, () => {
    console.log(`✅ Server running on http://localhost:${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
});
