import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { JoinDto } from './join.dto.js';
import { PublicService } from './public.service.js';

/** Endpoints abiertos que usa la web pública (fidelify-web). */
@Controller('public/businesses')
export class PublicController {
  constructor(private readonly service: PublicService) {}

  @Get(':slug')
  getProgram(@Param('slug') slug: string) {
    return this.service.getProgramBySlug(slug);
  }

  @Post(':slug/join')
  join(@Param('slug') slug: string, @Body() dto: JoinDto) {
    return this.service.join(slug, dto);
  }
}
