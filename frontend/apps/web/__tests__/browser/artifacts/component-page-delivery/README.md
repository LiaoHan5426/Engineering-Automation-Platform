# 本批保留的失败与恢复

result.json为最终V34后原链路恢复结果，failure.json/failure.png保留V33时Board交付旧单文件CHECK导致503；事务回滚，原候选APPLIED、源码和独立验证不变。V34后复用原Run/verification/proposal完成交付和技术决定，没有重复模型或独立前端全套。

main-preview-failure.png保留主工作区规范化后390px布局复现：原Collapse最小内容撑大任务审阅网格。L4审阅网格改minmax(0,1fr)后main-preview.json和main-page-390.png为通过结果，两个视口0写请求/0外部请求/0pageerror。不是用户产品接受。

独立真实模型只有1次；正式独立验证只有1次147文件906项/typecheck/build。重启后的浏览器延续会重读原APPLIED/验证并做只读交互，不重复全测。原模型交付字节和主工作区格式/CSS规范化分别记录hash，不互相替换。
