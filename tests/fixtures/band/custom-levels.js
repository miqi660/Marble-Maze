/** 自定义关卡连续索引模型。业务层索引范围为 0..11。 */
const MAX_CUSTOM_LEVELS = 12
const CUSTOM_PAGE_SIZE = 6

function storageKey(index) {
  if (typeof index !== 'number' || index % 1 !== 0 || index < 0 || index >= MAX_CUSTOM_LEVELS) return null
  const no = index + 1
  return 'custom_' + (no < 10 ? '0' + no : String(no))
}

module.exports = { MAX_CUSTOM_LEVELS, CUSTOM_PAGE_SIZE, storageKey }
