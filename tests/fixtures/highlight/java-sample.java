package garden.sample;

import java.util.List;

/** 강조기 시험용 표본이다. 실제 vault를 읽지 않으려고 여기에 고정해 둔다. */
@Service
public class NoteReader {
  private static final String ENDPOINT = "https://example.com/notes"; // 문자열 안의 //는 주석이 아니다

  // 주석 안의 "따옴표"와 /* 겹친 기호 */ 는 그대로 주석이다
  private static final String QUERY = """
      SELECT *
      FROM notes
      WHERE url = "https://example.com" -- 텍스트 블록 안은 전부 문자열이다
      """;

  @Override
  public List<String> read(int limit) {
    char quote = '"';
    long budget = 1_000_000L;
    double ratio = 1.5e-3;
    if (limit > 0 && quote != '\\') {
      return List.of(ENDPOINT, QUERY);
    }
    return null;
  }
}
