import {
  CreateCalendarEventSchema,
  UpdateCalendarEventSchema,
} from './calendar-event.dto';

describe('CalendarEvent DTO', () => {
  it("CreateCalendarEventSchema: endAt startAt'tan onceyse hata verir", () => {
    const result = CreateCalendarEventSchema.safeParse({
      title: 'Toplanti',
      startAt: '2026-09-10T12:00:00.000Z',
      endAt: '2026-09-10T10:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });

  it('CreateCalendarEventSchema: gecerli araligi kabul eder', () => {
    const result = CreateCalendarEventSchema.safeParse({
      title: 'Toplanti',
      startAt: '2026-09-10T10:00:00.000Z',
      endAt: '2026-09-10T11:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('UpdateCalendarEventSchema: sadece biri verilirse refine kontrolu atlar', () => {
    const result = UpdateCalendarEventSchema.safeParse({
      title: 'Yeni baslik',
    });
    expect(result.success).toBe(true);
  });

  it("UpdateCalendarEventSchema: her ikisi de verilip endAt startAt'tan onceyse hata verir", () => {
    const result = UpdateCalendarEventSchema.safeParse({
      startAt: '2026-09-10T12:00:00.000Z',
      endAt: '2026-09-10T10:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });
});
