import { All, Controller, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';

@Controller({ version: '2' }) // This controller handles everything under /api/v2
export class ProxyControllerTmp {
  @All('*wildcard') // Catch all HTTP methods and paths under /api/v2/*
  async proxyRequestTmp(@Req() req: Request, @Res() res: Response) {
    const wildcardPath = req.params.wildcard || ''; // Catch-all path after /api/v2
    console.log(
      '🚀 ~ ProxyControllerTmp ~ proxyRequestTmp ~ wildcardPath:',
      wildcardPath,
      req.path,
    );

    // Example: construct target URL
    const targetUrl = `http://your-backend-service/api/v2/${wildcardPath}`;

    // For now, just simulate a response
    res.status(200).json({ targetUrl });
  }
}
