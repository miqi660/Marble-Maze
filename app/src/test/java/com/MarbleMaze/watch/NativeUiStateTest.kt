package com.MarbleMaze.watch

import com.MarbleMaze.watch.ui.app.DeviceUiState
import com.MarbleMaze.watch.ui.app.MazeViewModel
import org.junit.Assert.*
import org.junit.Test

class NativeUiStateTest {
    @Test fun writesRequireConfirmedListAndIdleConnection() {
        val ready = DeviceUiState(connected = true, levels = emptyList())
        assertTrue(ready.canOperate)
        assertFalse(ready.copy(levels = null).canOperate)
        assertFalse(ready.copy(connected = false).canOperate)
        assertFalse(ready.copy(busy = true).canOperate)
        assertFalse(ready.copy(preparing = true).canOperate)
        assertFalse(ready.copy(unknown = true).canOperate)
    }
    @Test fun presetsKeepExistingGeneratorDimensions() {
        assertEquals(listOf(7 to 13, 8 to 15, 9 to 17, 10 to 19), MazeViewModel.presets.values.toList())
        assertEquals(listOf("简单", "正常", "困难", "专家"), MazeViewModel.presets.keys.map(MazeViewModel::label))
        assertEquals("自定义", MazeViewModel.label("custom"))
    }
}
