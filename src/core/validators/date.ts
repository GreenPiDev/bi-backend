/** M9: hatirlatma icin "gecmis tarih" kisitlanir, "gecmis an" degil - bugunun herhangi bir
 * saati (submit sirasindaki birkac saniyelik gecikme dahil) hala gecerli sayilmali. */
export function isPastCalendarDay(date: Date, now: Date = new Date()): boolean {
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  const startOfGivenDay = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );
  return startOfGivenDay.getTime() < startOfToday.getTime();
}
