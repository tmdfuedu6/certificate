/*
 * 발급 로그 설정 (구글 설문지) — 비워두면 로그를 보내지 않는다.
 * 보내는 값: 수업코드, 수료증 날짜, 발급자 성함, 발급자 연락처. 학생 이름은 절대 보내지 않는다.
 * 설문지 "미리 채워진 링크 가져오기"로 얻은 주소에서 값을 옮겨 적는다.
 */
window.MSW_LOG = {
  formAction: 'https://docs.google.com/forms/d/e/1FAIpQLScqmI81HIVwtToucL4HhNDm-4IQGJGqpXSo87dQgOSZa6Opkw/formResponse',
  codeField: 'entry.761867121',         // 질문: 수업코드
  dateField: 'entry.113791032',         // 질문: 수료증 날짜
  issuerNameField: 'entry.302173955',   // 질문: 발급자 성함
  issuerPhoneField: 'entry.935813847'   // 질문: 발급자 연락처
};
