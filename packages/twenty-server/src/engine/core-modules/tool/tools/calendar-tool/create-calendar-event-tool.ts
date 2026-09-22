import { Injectable } from '@nestjs/common';

import { PermissionFlagType } from 'twenty-shared/constants';

import { CreateCalendarEventToolInputZodSchema } from 'src/engine/core-modules/tool/tools/calendar-tool/calendar-tool.schema';
import { type CreateCalendarEventToolInput } from 'src/engine/core-modules/tool/tools/calendar-tool/types/create-calendar-event-tool-input.type';
import { type ToolOutput } from 'src/engine/core-modules/tool/types/tool-output.type';
import { type Tool } from 'src/engine/core-modules/tool/types/tool.type';

@Injectable()
export class CreateCalendarEventTool implements Tool {
  description = 'Calendar event creation is no longer available.';
  inputSchema = CreateCalendarEventToolInputZodSchema;
  flag = PermissionFlagType.CREATE_CALENDAR_EVENT_TOOL;

  async execute(
    _parameters: CreateCalendarEventToolInput,
  ): Promise<ToolOutput> {
    return {
      success: false,
      message: 'Calendar event creation is no longer available',
      error: 'Calendar event creation is no longer available',
    };
  }
}
