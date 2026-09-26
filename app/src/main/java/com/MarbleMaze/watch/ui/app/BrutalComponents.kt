package com.MarbleMaze.watch.ui.app

import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.MarbleMaze.watch.ui.theme.BrutalColors

/** 阴影是实心偏移图形；预留右下空间，不使用 elevation 或模糊。 */
@Composable
fun HardShadowBox(modifier: Modifier = Modifier, depth: Dp = 3.dp, radius: Dp = 12.dp, reservedDepth: Dp = depth, content: @Composable () -> Unit) {
    Box(modifier.padding(end = reservedDepth, bottom = reservedDepth).drawBehind {
        drawRoundRect(BrutalColors.Ink, topLeft = Offset(depth.toPx(), depth.toPx()),
            cornerRadius = CornerRadius(radius.toPx()), size = size)
    }) { content() }
}

@Composable
fun BrutalCard(modifier: Modifier = Modifier, color: Color = BrutalColors.Paper, depth: Dp = 3.dp,
               border: Dp = 2.dp, radius: Dp = 12.dp, content: @Composable () -> Unit) {
    HardShadowBox(modifier, depth, radius) {
        Surface(shape = RoundedCornerShape(radius), color = color, contentColor = BrutalColors.Ink,
            border = BorderStroke(border, BrutalColors.Ink), tonalElevation = 0.dp, shadowElevation = 0.dp, content = content)
    }
}

@Composable
fun BrutalButton(onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true,
                 color: Color = BrutalColors.Yellow, depth: Dp = 5.dp, border: Dp = 3.dp,
                 loading: Boolean = false, shadowSpace: Dp = depth, animatePress: Boolean = true, content: @Composable RowScope.() -> Unit) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val displacement by animateDpAsState(if (animatePress && pressed && enabled && !loading) depth else 0.dp, tween(75), label = "按钮按压")
    HardShadowBox(modifier, if (enabled) depth else 0.dp, 9.dp, reservedDepth = shadowSpace) {
        Surface(onClick = onClick, enabled = enabled && !loading, interactionSource = interaction,
            modifier = Modifier.offset { IntOffset(displacement.roundToPx(), displacement.roundToPx()) }, shape = RoundedCornerShape(9.dp),
            color = if (enabled) color else BrutalColors.Muted, contentColor = BrutalColors.Ink,
            border = BorderStroke(border, BrutalColors.Ink), tonalElevation = 0.dp, shadowElevation = 0.dp) {
            ProvideTextStyle(MaterialTheme.typography.labelLarge) {
                Row(Modifier.fillMaxWidth().heightIn(min = 52.dp).padding(horizontal = 12.dp, vertical = 12.dp),
                    horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically, content = content)
            }
        }
    }
}

@Composable
fun BrutalOutlinedButton(onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true,
                         loading: Boolean = false, content: @Composable RowScope.() -> Unit) {
    BrutalButton(onClick, modifier, enabled, color = BrutalColors.Paper, depth = 2.dp, border = 2.dp, loading = loading, content = content)
}

/** 小型图标操作：Level 3 控件重量，保留 75ms 按压位移。 */
@Composable
fun BrutalIconButton(onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true,
                     color: Color = BrutalColors.Yellow, depth: Dp = 2.dp, border: Dp = 2.dp,
                     loading: Boolean = false, contentDescription: String? = null,
                     content: @Composable () -> Unit) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val displacement by animateDpAsState(if (pressed && enabled && !loading) depth else 0.dp, tween(75), label = "图标按钮按压")
    // 禁用只改变阴影绘制，保留占位，避免生成状态切换时挤动整张预览卡片。
    HardShadowBox(modifier, if (enabled) depth else 0.dp, 9.dp, reservedDepth = depth) {
        Surface(onClick = onClick, enabled = enabled && !loading, interactionSource = interaction,
            modifier = Modifier.offset { IntOffset(displacement.roundToPx(), displacement.roundToPx()) }, shape = RoundedCornerShape(9.dp),
            color = if (enabled) color else BrutalColors.Muted, contentColor = BrutalColors.Ink,
            border = BorderStroke(border, BrutalColors.Ink), tonalElevation = 0.dp, shadowElevation = 0.dp) {
            Box(Modifier.size(50.dp), contentAlignment = Alignment.Center) {
                if (loading) CircularProgressIndicator(Modifier.size(22.dp), color = BrutalColors.Ink, strokeWidth = 2.5.dp)
                else {
                    if (contentDescription != null) Box(Modifier.semantics { this.contentDescription = contentDescription }) { content() }
                    else content()
                }
            }
        }
    }
}

/** 底部导航项：无硬阴影，与操作按钮明确区分。 */
@Composable
fun BrutalNavigationItem(label: String, icon: String, selected: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Surface(onClick = onClick, modifier = modifier.semantics { this.selected = selected },
        shape = RoundedCornerShape(10.dp), color = if (selected) BrutalColors.Yellow else Color.Transparent,
        contentColor = BrutalColors.Ink, border = if (selected) BorderStroke(2.dp, BrutalColors.Ink) else null,
        tonalElevation = 0.dp, shadowElevation = 0.dp) {
        Row(Modifier.heightIn(min = 48.dp).padding(horizontal = 12.dp, vertical = 10.dp),
            horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
            AppIcon(icon)
            Spacer(Modifier.width(8.dp))
            Text(label, style = MaterialTheme.typography.labelLarge,
                fontWeight = if (selected) FontWeight.ExtraBold else FontWeight.Bold)
        }
    }
}

@Composable
fun BrutalSegment(text: String, selected: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true, loading: Boolean = false) {
    BrutalButton(onClick, modifier.semantics { this.selected = selected }, enabled,
        color = if (selected) BrutalColors.Yellow else BrutalColors.Paper, depth = 2.dp, border = 2.dp, loading = loading, shadowSpace = 3.dp, animatePress = false) {
        Text(text, maxLines = 1)
    }
}

@Composable
fun BrutalTag(text: String, modifier: Modifier = Modifier, color: Color = BrutalColors.Yellow) {
    Text(text, modifier.background(color, RoundedCornerShape(6.dp)).border(2.dp, BrutalColors.Ink, RoundedCornerShape(6.dp))
        .padding(horizontal = 9.dp, vertical = 5.dp), color = BrutalColors.Ink, style = MaterialTheme.typography.labelSmall)
}

@Composable
fun BrutalTextField(value: String, onValueChange: (String) -> Unit, modifier: Modifier = Modifier,
                    label: @Composable (() -> Unit)? = null, placeholder: @Composable (() -> Unit)? = null,
                    singleLine: Boolean = true, isError: Boolean = false, keyboardOptions: KeyboardOptions = KeyboardOptions.Default) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        label?.let { ProvideTextStyle(MaterialTheme.typography.labelLarge) { it() } }
        OutlinedTextField(value, onValueChange, modifier = Modifier.fillMaxWidth().border(2.dp,
            if (isError) MaterialTheme.colorScheme.error else BrutalColors.Ink, RoundedCornerShape(8.dp)),
            placeholder = placeholder, singleLine = singleLine, isError = isError, keyboardOptions = keyboardOptions,
            textStyle = MaterialTheme.typography.titleMedium, shape = RoundedCornerShape(8.dp),
            colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = Color.Transparent, unfocusedBorderColor = Color.Transparent,
                errorBorderColor = Color.Transparent, focusedContainerColor = BrutalColors.Paper, unfocusedContainerColor = BrutalColors.Paper,
                errorContainerColor = BrutalColors.Paper))
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BrutalSheet(onDismissRequest: () -> Unit, content: @Composable ColumnScope.() -> Unit) {
    val shape = RoundedCornerShape(topStart = 12.dp, topEnd = 12.dp)
    ModalBottomSheet(onDismissRequest = onDismissRequest, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        shape = shape, containerColor = BrutalColors.Background, tonalElevation = 0.dp, dragHandle = null) {
        // 描边必须位于随弹层移动的内容内部，不能画在外层定位节点上。
        Column(Modifier.fillMaxWidth().border(3.dp, BrutalColors.Ink, shape)) {
            Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                Box(Modifier.padding(vertical = 14.dp).size(44.dp, 5.dp).background(BrutalColors.Ink))
            }
            content()
        }
    }
}
