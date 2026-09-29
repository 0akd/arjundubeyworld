package com.arjun.arjundubey.whiteboard

object WhiteboardSessionCache {
    data class HistoryState(
        val history: List<List<WhiteboardSlide>>,
        val historyIndex: Int,
    )

    private val cache = mutableMapOf<String, HistoryState>()

    fun get(todoId: String): HistoryState? = cache[todoId]

    fun save(todoId: String, history: List<List<WhiteboardSlide>>, index: Int) {
        cache[todoId] = HistoryState(history, index)
    }
}
