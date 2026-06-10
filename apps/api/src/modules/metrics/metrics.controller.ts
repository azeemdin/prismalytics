import { Controller, Get, Header, Res } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { MetricsService } from './metrics.service';

@ApiTags('metrics')
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  @Public()
  @Header('content-type', 'text/plain; version=0.0.4; charset=utf-8')
  @ApiOperation({ summary: 'Prometheus-compatible metrics endpoint' })
  prometheus(@Res() res: Response) {
    res.send(this.metrics.renderPrometheusText());
  }

  @Get('json')
  @Public()
  @ApiOperation({ summary: 'Metrics in JSON format' })
  json() {
    return this.metrics.getJson();
  }
}
