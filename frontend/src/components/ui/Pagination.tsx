export function Pagination({
  page,
  totalPages,
  total,
  onChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  onChange: (page: number) => void;
}) {
  return (
    <div className="pagination">
      <span>
        {total} نتيجة · الصفحة {page} من {totalPages}
      </span>
      <div>
        <button
          className="button button-secondary"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          السابق
        </button>
        <button
          className="button button-secondary"
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
        >
          التالي
        </button>
      </div>
    </div>
  );
}
